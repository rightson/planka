#!/usr/bin/env node
/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

/**
 * migrate-card-content.js
 *
 * Migrates cards from the old description-based system to the new file-based content system.
 *
 * Usage:
 *   node server/scripts/migrate-card-content.js [options]
 *
 * Options:
 *   --dry-run       Show what would be migrated without making changes
 *   --resume        Resume from last failure
 *   --batch-size N  Process N cards at a time (default: 100)
 *   --card-id ID    Migrate only a specific card
 */

const crypto = require('crypto');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  resume: args.includes('--resume'),
  batchSize: parseInt(args.find((arg) => arg.startsWith('--batch-size='))?.split('=')[1] || '100', 10),
  cardId: args.find((arg) => arg.startsWith('--card-id='))?.split('=')[1],
};

// Bootstrap Sails
require('sails').load(
  {
    hooks: {
      grunt: false,
      pubsub: false,
      sockets: false,
      session: false,
      views: false,
      blueprints: false,
    },
    log: {
      level: 'info',
    },
  },
  async (err, sails) => {
    if (err) {
      console.error('Failed to load Sails:', err);
      process.exit(1);
    }

    try {
      await runMigration(options);
      sails.lower(() => {
        process.exit(0);
      });
    } catch (error) {
      console.error('Migration failed:', error);
      sails.lower(() => {
        process.exit(1);
      });
    }
  },
);

async function runMigration(options) {
  console.log('🚀 Starting card content migration...\n');
  console.log('Options:', options, '\n');

  // Get cards to migrate
  let cards;
  if (options.cardId) {
    const card = await Card.findOne({ id: options.cardId });
    cards = card ? [card] : [];
  } else {
    const query = {
      description: { '!=': null },
    };

    if (!options.resume) {
      query.contentMigrated = false;
    }

    cards = await Card.find(query);
  }

  if (cards.length === 0) {
    console.log('✅ No cards to migrate!');
    return;
  }

  console.log(`📊 Found ${cards.length} cards to migrate\n`);

  const stats = {
    total: cards.length,
    success: 0,
    skipped: 0,
    errors: 0,
    inlineAttachmentsCreated: 0,
    totalSizeBefore: 0,
    totalSizeAfter: 0,
    // Hybrid storage stats
    inlineStorage: 0,
    externalStorage: 0,
    inlineStorageSize: 0,
    externalStorageSize: 0,
  };

  // Process cards in batches
  for (let i = 0; i < cards.length; i += options.batchSize) {
    const batch = cards.slice(i, i + options.batchSize);

    console.log(
      `Processing batch ${Math.floor(i / options.batchSize) + 1}/${Math.ceil(cards.length / options.batchSize)}...`,
    );

    for (const card of batch) {
      const result = await migrateCard(card, options);

      if (result.status === 'success') {
        stats.success += 1;
        stats.inlineAttachmentsCreated += result.inlineAttachmentsCreated || 0;
        stats.totalSizeBefore += result.sizeBefore || 0;
        stats.totalSizeAfter += result.sizeAfter || 0;
        // Track hybrid storage distribution
        if (result.storageType === 'inline') {
          stats.inlineStorage += 1;
          stats.inlineStorageSize += result.sizeAfter || 0;
        } else if (result.storageType === 'external') {
          stats.externalStorage += 1;
          stats.externalStorageSize += result.sizeAfter || 0;
        }
      } else if (result.status === 'skipped') {
        stats.skipped += 1;
      } else {
        stats.errors += 1;
      }

      // Progress indicator
      const progress = Math.floor(((i + batch.indexOf(card) + 1) / cards.length) * 100);
      process.stdout.write(`\rProgress: ${progress}% (${i + batch.indexOf(card) + 1}/${cards.length})`);
    }

    // Rate limiting between batches
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log('\n\n📈 Migration Statistics:');
  console.log('======================');
  console.log(`Total cards:              ${stats.total}`);
  console.log(`✅ Successfully migrated: ${stats.success}`);
  console.log(`⏭️  Skipped:               ${stats.skipped}`);
  console.log(`❌ Errors:                ${stats.errors}`);
  console.log(`🖼️  Inline attachments:    ${stats.inlineAttachmentsCreated}`);

  if (stats.totalSizeBefore > 0) {
    console.log(
      `💾 Size reduction:        ${formatBytes(stats.totalSizeBefore - stats.totalSizeAfter)} (${Math.round(
        ((stats.totalSizeBefore - stats.totalSizeAfter) / stats.totalSizeBefore) * 100,
      )}%)`,
    );
  }

  console.log('\n📦 Hybrid Storage Distribution:');
  console.log('================================');
  console.log(
    `💿 Inline (DB):           ${stats.inlineStorage} cards (${formatBytes(stats.inlineStorageSize)}) - ${Math.round(
      (stats.inlineStorage / stats.success) * 100,
    )}%`,
  );
  console.log(
    `📁 External (Files):      ${stats.externalStorage} cards (${formatBytes(stats.externalStorageSize)}) - ${Math.round(
      (stats.externalStorage / stats.success) * 100,
    )}%`,
  );
  console.log(
    `📊 Average inline size:   ${stats.inlineStorage > 0 ? formatBytes(stats.inlineStorageSize / stats.inlineStorage) : '0 Bytes'}`,
  );
  console.log(
    `📊 Average external size: ${stats.externalStorage > 0 ? formatBytes(stats.externalStorageSize / stats.externalStorage) : '0 Bytes'}`,
  );
}

async function migrateCard(card, options) {
  try {
    // Check if already migrated
    if (card.contentMigrated && !options.resume) {
      console.log(`\nCard ${card.id}: Already migrated, skipping`);
      return { status: 'skipped' };
    }

    // Skip if no description
    if (!card.description) {
      console.log(`\nCard ${card.id}: No description, skipping`);
      return { status: 'skipped' };
    }

    console.log(`\nCard ${card.id}: Migrating...`);

    // Extract base64 images from description
    const base64Images = extractBase64Images(card.description);

    console.log(`  Found ${base64Images.length} base64 images`);

    if (options.dryRun) {
      // Estimate size after migration (approximate)
      const estimatedSize = card.description.length;
      const inlineThreshold = sails.config.custom.cardContentInlineThreshold || 1 * 1024 * 1024;
      const estimatedStorageType =
        estimatedSize <= inlineThreshold ? CardContent.StorageTypes.INLINE : CardContent.StorageTypes.EXTERNAL;

      console.log(
        `  📦 Estimated storage: ${estimatedStorageType} (${formatBytes(estimatedSize)}${estimatedStorageType === 'inline' ? ' - would use DB' : ' - would use files'})`,
      );

      return {
        status: 'success',
        storageType: estimatedStorageType,
        inlineAttachmentsCreated: base64Images.length,
        sizeBefore: card.description.length,
        sizeAfter: estimatedSize,
      };
    }

    // Convert base64 images to inline attachments
    const inlineAttachments = [];

    for (let i = 0; i < base64Images.length; i += 1) {
      const img = base64Images[i];
      const buffer = Buffer.from(img.data, 'base64');
      const filename = `pasted-image-${i + 1}.${img.ext}`;

      // Create UploadedFile
      const uploadedFile = await UploadedFile.qm.createOne({
        type: UploadedFile.Types.ATTACHMENT,
        mimeType: img.mimeType,
        size: buffer.length,
      });

      // Save to storage
      const fileManager = sails.hooks.fileManager.getInstance();
      await fileManager.saveInlineAttachment(uploadedFile.id, filename, buffer);

      // Create InlineAttachment
      const contentId = `img_${crypto.randomBytes(8).toString('hex')}`;
      const inlineAtt = await InlineAttachment.create({
        cardId: card.id,
        uploadedFileId: uploadedFile.id,
        attachmentType: InlineAttachment.AttachmentTypes.INLINE,
        source: InlineAttachment.Sources.MIGRATION,
        contentId,
        altText: `Migrated image ${i + 1}`,
        position: i,
        isActive: true,
        referenceCount: 1,
      }).fetch();

      inlineAttachments.push({
        original: img.original,
        contentId,
        inlineAtt,
      });

      console.log(`  ✅ Created inline attachment ${i + 1}/${base64Images.length}`);
    }

    // Replace base64 with inline:// references
    let migratedContent = card.description;
    for (const { original, contentId } of inlineAttachments) {
      migratedContent = migratedContent.replace(original, `![](inline://${contentId})`);
    }

    // Calculate content size and hash
    const contentSize = Buffer.byteLength(migratedContent, 'utf-8');
    const contentHash = crypto.createHash('sha256').update(migratedContent).digest('hex');

    // Determine storage type based on size (HYBRID STRATEGY)
    const inlineThreshold = sails.config.custom.cardContentInlineThreshold || 1 * 1024 * 1024; // 1MB
    const storageType =
      contentSize <= inlineThreshold ? CardContent.StorageTypes.INLINE : CardContent.StorageTypes.EXTERNAL;

    console.log(
      `  📦 Storage: ${storageType} (${formatBytes(contentSize)}${storageType === 'inline' ? ' - will use DB' : ' - will use files'})`,
    );

    let contentInline = null;
    let contentRef = null;

    // Save based on storage type
    if (storageType === CardContent.StorageTypes.INLINE) {
      // ✅ Store in database - use ACID transaction
      await sails.getDatastore().transaction(async (db) => {
        // Create CardContent record
        await CardContent.create({
          cardId: card.id,
          contentType: CardContent.ContentTypes.MARKDOWN,
          storageType: CardContent.StorageTypes.INLINE,
          contentInline: migratedContent,
          contentRef: null,
          contentHash,
          size: contentSize,
          version: 1,
          inlineAttachmentIds: inlineAttachments.map((a) => a.inlineAtt.id),
        })
          .usingConnection(db)
          .fetch();

        // Mark as migrated - atomically with content creation
        await Card.updateOne({ id: card.id })
          .set({
            contentMigrated: true,
            contentVersion: 1,
          })
          .usingConnection(db);
      });

      console.log(`  ✅ Card ${card.id} migrated to INLINE storage (ACID transaction)`);
    } else {
      // ✅ Store in file system
      const fileManager = sails.hooks.fileManager.getInstance();
      contentRef = await fileManager.saveCardContent(card.id, migratedContent, 1);

      await CardContent.create({
        cardId: card.id,
        contentType: CardContent.ContentTypes.MARKDOWN,
        storageType: CardContent.StorageTypes.EXTERNAL,
        contentInline: null,
        contentRef,
        contentHash,
        size: contentSize,
        version: 1,
        inlineAttachmentIds: inlineAttachments.map((a) => a.inlineAtt.id),
      });

      // Mark as migrated
      await Card.updateOne({ id: card.id }).set({
        contentMigrated: true,
        contentVersion: 1,
      });

      console.log(`  ✅ Card ${card.id} migrated to EXTERNAL storage (file: ${contentRef})`);
    }

    return {
      status: 'success',
      storageType,
      inlineAttachmentsCreated: inlineAttachments.length,
      sizeBefore: card.description.length,
      sizeAfter: contentSize,
    };
  } catch (error) {
    console.error(`  ❌ Card ${card.id} migration failed:`, error.message);
    return { status: 'error', error: error.message };
  }
}

/**
 * Extract base64 images from markdown content
 * @param {string} content - Markdown content
 * @returns {Array} - Array of base64 image data
 */
function extractBase64Images(content) {
  const regex = /!\[.*?\]\(data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)\)/g;
  const images = [];
  let match;

  // eslint-disable-next-line no-cond-assign
  while ((match = regex.exec(content)) !== null) {
    const mimeType = match[1];
    const data = match[2];
    const ext = mimeType.split('/')[1];

    images.push({
      original: match[0],
      mimeType,
      data,
      ext,
    });
  }

  return images;
}

/**
 * Format bytes to human-readable size
 * @param {number} bytes - Bytes
 * @returns {string} - Formatted size
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}
