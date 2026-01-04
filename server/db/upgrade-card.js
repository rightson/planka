#!/usr/bin/env node

/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

/**
 * Migration script to upgrade card descriptions from base64-embedded images
 * to the new large card content system with inline attachments.
 *
 * Usage:
 *   node server/db/upgrade-card.js               # Migrate all cards
 *   node server/db/upgrade-card.js --card-id=123  # Migrate specific card
 *   node server/db/upgrade-card.js --dry-run      # Preview changes without applying
 */

const Sails = require('sails');
const crypto = require('crypto');
const { Readable } = require('stream');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  cardId: null,
};

// Extract card ID if specified
const cardIdArg = args.find((arg) => arg.startsWith('--card-id='));
if (cardIdArg) {
  options.cardId = cardIdArg.split('=')[1];
}

/**
 * Generate a unique content ID for inline attachments
 */
function generateContentId() {
  return `img_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Extract base64 images from markdown content
 */
function extractBase64Images(content) {
  const base64Regex = /!\[([^\]]*)]\(data:(image\/[\w+.-]+);base64,([A-Za-z0-9+/=]+)\)/g;
  const images = [];

  let match;
  while ((match = base64Regex.exec(content)) !== null) {
    images.push({
      original: match[0], // Full match for replacement
      altText: match[1] || null,
      mimeType: match[2],
      data: match[3],
    });
  }

  return images;
}

/**
 * Get file extension from MIME type
 */
function getExtensionFromMimeType(mimeType) {
  const mimeToExt = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
  };

  return mimeToExt[mimeType] || 'png';
}

/**
 * Migrate a single card
 */
async function migrateCard(cardId, fileManager) {
  const card = await Card.findOne({ id: cardId });

  if (!card) {
    return { status: 'not_found', cardId };
  }

  if (card.contentMigrated) {
    return { status: 'already_migrated', cardId };
  }

  if (!card.description || card.description.trim() === '') {
    return { status: 'empty_description', cardId };
  }

  // Extract base64 images
  const base64Images = extractBase64Images(card.description);

  if (base64Images.length === 0) {
    // No base64 images, but still migrate to new content system
    try {
      if (!options.dryRun) {
        const { contentRef, contentHash, size } = await sails.helpers.cardContent.saveContent({
          cardId: card.id,
          content: card.description,
          version: 1,
          contentType: 'markdown',
        });

        await CardContent.create({
          cardId: card.id,
          contentType: 'markdown',
          contentRef,
          contentHash,
          size,
          version: 1,
          inlineAttachmentIds: [],
        });

        await Card.updateOne({ id: card.id }).set({
          contentMigrated: true,
          contentVersion: 1,
        });
      }

      return {
        status: 'migrated_no_images',
        cardId,
        sizeBefore: card.description.length,
        sizeAfter: card.description.length,
      };
    } catch (error) {
      return {
        status: 'error',
        cardId,
        error: error.message,
      };
    }
  }

  // Migrate cards with base64 images
  try {
    const inlineAttachments = [];
    let migratedContent = card.description;

    // Process each base64 image
    for (let index = 0; index < base64Images.length; index += 1) {
      const img = base64Images[index];
      const buffer = Buffer.from(img.data, 'base64');
      const extension = getExtensionFromMimeType(img.mimeType);
      const filename = `pasted-image-${index + 1}.${extension}`;

      // Calculate hash for deduplication
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');

      if (!options.dryRun) {
        // Check if file with same hash already exists
        let uploadedFile = await UploadedFile.findOne({
          type: 'attachment',
          hash,
        });

        if (!uploadedFile) {
          // Create UploadedFile record
          uploadedFile = await UploadedFile.create({
            type: 'attachment',
            mimeType: img.mimeType,
            size: buffer.length,
            referencesTotal: 1,
            hash,
          }).fetch();

          // Save file to storage
          const filePathSegment = `private/inline-attachments/${uploadedFile.id}/${filename}`;
          const stream = Readable.from([buffer]);
          await fileManager.save(filePathSegment, stream);
        } else {
          // File already exists, increment reference count
          await UploadedFile.updateOne({ id: uploadedFile.id }).set({
            referencesTotal: uploadedFile.referencesTotal + 1,
          });
        }

        // Create InlineAttachment record
        const contentId = generateContentId();
        const inlineAttachment = await InlineAttachment.create({
          cardId: card.id,
          uploadedFileId: uploadedFile.id,
          attachmentType: 'inline',
          source: 'migration',
          contentId,
          altText: img.altText,
          position: index,
        }).fetch();

        inlineAttachments.push({
          id: inlineAttachment.id,
          contentId,
          original: img.original,
        });

        // Replace base64 with inline:// reference
        migratedContent = migratedContent.replace(
          img.original,
          `![${img.altText || ''}](inline://${contentId})`,
        );
      } else {
        // Dry run - just log what would happen
        const contentId = generateContentId();
        inlineAttachments.push({
          contentId,
          original: img.original,
          size: buffer.length,
        });
      }
    }

    if (!options.dryRun) {
      // Save migrated content
      const { contentRef, contentHash, size } = await sails.helpers.cardContent.saveContent({
        cardId: card.id,
        content: migratedContent,
        version: 1,
        contentType: 'markdown',
      });

      await CardContent.create({
        cardId: card.id,
        contentType: 'markdown',
        contentRef,
        contentHash,
        size,
        version: 1,
        inlineAttachmentIds: inlineAttachments.map((a) => a.id),
      });

      // Mark card as migrated
      await Card.updateOne({ id: card.id }).set({
        contentMigrated: true,
        contentVersion: 1,
      });
    }

    return {
      status: 'success',
      cardId,
      inlineAttachmentsCreated: inlineAttachments.length,
      sizeBefore: card.description.length,
      sizeAfter: migratedContent.length,
      savedBytes: card.description.length - migratedContent.length,
    };
  } catch (error) {
    console.error(`Migration failed for card ${cardId}:`, error);
    return {
      status: 'error',
      cardId,
      error: error.message,
      stack: error.stack,
    };
  }
}

/**
 * Migrate all cards
 */
async function migrateAll(fileManager) {
  let query = {
    contentMigrated: false,
    description: { '!=': null },
  };

  if (options.cardId) {
    query = { id: options.cardId };
  }

  const cards = await Card.find(query);

  console.log(`Found ${cards.length} card(s) to migrate...`);
  if (options.dryRun) {
    console.log('DRY RUN MODE - No changes will be applied\n');
  }

  const results = {
    total: cards.length,
    success: 0,
    alreadyMigrated: 0,
    noImages: 0,
    empty: 0,
    errors: 0,
    totalInlineAttachments: 0,
    totalBytesSaved: 0,
  };

  for (const card of cards) {
    const result = await migrateCard(card.id, fileManager);

    console.log(
      `Card ${result.cardId}: ${result.status}${
        result.inlineAttachmentsCreated ? ` (${result.inlineAttachmentsCreated} images)` : ''
      }${result.savedBytes ? ` (saved ${result.savedBytes} bytes)` : ''}`,
    );

    if (result.status === 'success') {
      results.success += 1;
      results.totalInlineAttachments += result.inlineAttachmentsCreated || 0;
      results.totalBytesSaved += result.savedBytes || 0;
    } else if (result.status === 'migrated_no_images') {
      results.noImages += 1;
    } else if (result.status === 'already_migrated') {
      results.alreadyMigrated += 1;
    } else if (result.status === 'empty_description') {
      results.empty += 1;
    } else if (result.status === 'error') {
      results.errors += 1;
      console.error(`  Error: ${result.error}`);
    }

    // Rate limiting - wait 100ms between cards to avoid overwhelming the system
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  console.log('\n=== Migration Summary ===');
  console.log(`Total cards: ${results.total}`);
  console.log(`Successfully migrated: ${results.success}`);
  console.log(`Migrated without images: ${results.noImages}`);
  console.log(`Already migrated: ${results.alreadyMigrated}`);
  console.log(`Empty descriptions: ${results.empty}`);
  console.log(`Errors: ${results.errors}`);
  console.log(`Total inline attachments created: ${results.totalInlineAttachments}`);
  console.log(`Total bytes saved: ${results.totalBytesSaved} (${(results.totalBytesSaved / 1024 / 1024).toFixed(2)} MB)`);

  return results;
}

/**
 * Main function
 */
async function main() {
  console.log('Starting card content migration...\n');

  let sailsInstance;

  try {
    // Lift Sails
    sailsInstance = await Sails.load({
      appPath: path.resolve(__dirname, '..'),
      hooks: {
        grunt: false,
        sockets: false,
        pubsub: false,
        views: false,
      },
      log: {
        level: 'warn',
      },
    });

    const fileManager = sails.hooks['file-manager'].getInstance();
    const results = await migrateAll(fileManager);

    console.log('\nMigration completed!');

    if (options.dryRun) {
      console.log('\n⚠️  This was a DRY RUN - no changes were applied.');
      console.log('Run without --dry-run to apply changes.');
    }

    process.exit(results.errors > 0 ? 1 : 0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    if (sailsInstance) {
      await sailsInstance.lower();
    }
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { migrateCard, migrateAll };
