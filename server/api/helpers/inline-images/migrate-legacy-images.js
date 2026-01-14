/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

const crypto = require('crypto');
const path = require('path');
const { Readable } = require('stream');
const { rimraf } = require('rimraf');
const { fileTypeFromBuffer } = require('file-type');

/**
 * Migrate base64 images in markdown to file-based storage
 * Finds data: URLs in markdown and converts them to file uploads
 */
module.exports = {
  inputs: {
    cardId: {
      type: 'ref', // Accept any type - will convert to string internally
      required: true,
      description: 'The ID of the card (string, number, or object with id)',
    },
    markdown: {
      type: 'string',
      required: false,
      description: 'The markdown content containing possible base64 images',
    },
  },

  async fn(inputs, exits) {
    const { markdown } = inputs;

    // Use MAX_UPLOAD_FILE_SIZE from config, or 10MB as default
    const maxSize = sails.config.custom.maxUploadFileSize || 10 * 1024 * 1024;

    // Check if inline_image table exists before attempting migration
    // This prevents errors when the feature hasn't been enabled via migration
    try {
      const tableExists = await sails.sendNativeQuery(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = 'inline_image'
        );`
      );

      const exists = tableExists?.rows?.[0]?.exists;
      if (!exists) {
        sails.log.debug('Skipping base64 migration: inline_image table does not exist');
        return exits.success(markdown);
      }
    } catch (error) {
      sails.log.warn('Could not check for inline_image table existence:', error.message);
      // If we can't check, skip migration to be safe
      return exits.success(markdown);
    }

    // Convert cardId to string - handle various formats
    let cardId;
    const rawCardId = inputs.cardId;

    if (typeof rawCardId === 'string') {
      cardId = rawCardId;
    } else if (typeof rawCardId === 'number') {
      cardId = String(rawCardId);
    } else if (rawCardId && typeof rawCardId === 'object') {
      // Try various conversion methods
      if (typeof rawCardId.toString === 'function' && rawCardId.toString() !== '[object Object]') {
        cardId = rawCardId.toString();
      } else if (typeof rawCardId.valueOf === 'function') {
        const value = rawCardId.valueOf();
        cardId = typeof value === 'object' ? JSON.stringify(value) : String(value);
      } else if (rawCardId.id !== undefined) {
        cardId = String(rawCardId.id);
      } else if (rawCardId.value !== undefined) {
        cardId = String(rawCardId.value);
      } else {
        cardId = JSON.stringify(rawCardId);
        sails.log.warn('Card ID is complex object, converted to:', cardId);
      }
    } else {
      cardId = String(rawCardId);
    }

    // If no markdown provided, return as is
    if (!markdown) {
      return exits.success(markdown);
    }

    const fileManager = sails.hooks['file-manager'].getInstance();

    // Regex to match markdown images with data URLs
    // Matches: ![alt text](data:image/png;base64,...)
    const base64ImageRegex = /!\[([^\]]*)\]\(data:image\/(png|jpeg|jpg|gif|webp|avif);base64,([^)]+)\)/g;

    let updatedMarkdown = markdown;
    const matches = [...markdown.matchAll(base64ImageRegex)];

    // If no base64 images found, return original
    if (matches.length === 0) {
      return exits.success(markdown);
    }

    sails.log.info(`Migrating ${matches.length} base64 images for card ${cardId}`);

    // Process each base64 image
    for (const match of matches) {
      try {
        const [fullMatch, altText, mimeTypeExt, base64Data] = match;
        const mimeType = `image/${mimeTypeExt === 'jpg' ? 'jpeg' : mimeTypeExt}`;

        // Decode base64 to buffer
        const buffer = Buffer.from(base64Data, 'base64');
        const size = buffer.length;

        // Validate size
        if (size > maxSize) {
          sails.log.warn(`Skipping base64 image migration: size ${size} exceeds max ${maxSize}`);
          continue; // Skip this image, keep as base64
        }

        // Validate MIME type using buffer detection for accuracy
        const detectedType = await fileTypeFromBuffer(buffer);
        const finalMimeType = detectedType?.mime || mimeType;

        // Validate using helper
        let validation;
        try {
          validation = await sails.helpers.utils.validateInlineImage({
            mimeType: finalMimeType,
            size,
            maxSize,
          });
        } catch (error) {
          sails.log.warn(`Skipping invalid base64 image: ${error.message}`);
          continue; // Skip invalid images
        }

        const { extension } = validation;

        // Generate unique filename
        const filename = await sails.helpers.utils.generateInlineImageFilename({
          cardId,
          extension,
        });

        // Create UploadedFile record
        const { id: uploadedFileId } = await UploadedFile.qm.createOne({
          mimeType: finalMimeType,
          size,
          type: UploadedFile.Types.ATTACHMENT,
        });

        // Increment reference count
        await UploadedFile.qm.update({
          id: uploadedFileId,
        }, {
          referencesTotal: 1,
        });

        // Save file atomically
        const filePathSegment = `${sails.config.custom.inlineImagesPathSegment}/${filename}`;

        try {
          await fileManager.save(filePathSegment, Readable.from(buffer));
        } catch (saveError) {
          sails.log.error('Failed to save migrated inline image:', saveError);
          // Clean up UploadedFile record
          await UploadedFile.qm.destroy({ id: uploadedFileId });
          continue; // Skip this image, keep as base64
        }

        // Create InlineImage record for tracking
        let inlineImage;
        try {
          inlineImage = await InlineImage.qm.create({
            cardId,
            uploadedFileId,
            filename,
            markdownPath: null, // Will be generated from ID
          }).fetch();
        } catch (recordError) {
          sails.log.error('Failed to create InlineImage record:', recordError);
          // Clean up file
          await fileManager.delete(filePathSegment);
          await UploadedFile.qm.destroy({ id: uploadedFileId });
          continue;
        }

        // Generate authenticated URL path using the inline image ID
        const markdownPath = `api/inline-images/${inlineImage.id}`;

        // Update the record with the markdown path
        await InlineImage.qm.updateOne(inlineImage.id, { markdownPath });

        // Replace base64 data URL with file URL in markdown
        // Preserve alt text if it exists
        const newImageMarkdown = `![${altText}](/${markdownPath})`;
        updatedMarkdown = updatedMarkdown.replace(fullMatch, newImageMarkdown);

        sails.log.info(`Migrated base64 image to ${markdownPath}`);
      } catch (error) {
        sails.log.error('Error migrating base64 image:', error);
        // Continue with next image
      }
    }

    return exits.success(updatedMarkdown);
  },
};
