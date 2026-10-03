/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

const fsPromises = require('fs').promises;
const { Readable } = require('stream');
const { rimraf } = require('rimraf');
const { fileTypeFromFile } = require('file-type');

module.exports = {
  inputs: {
    cardId: {
      type: 'ref', // Accept any type - will convert to string internally
      required: true,
      description: 'The ID of the card (string, number, or object with id)',
    },
    file: {
      type: 'json',
      required: true,
      description: 'The uploaded file object from Sails',
    },
    maxSize: {
      type: 'number',
      defaultsTo: 10 * 1024 * 1024, // 10MB
      description: 'Maximum allowed file size in bytes',
    },
  },

  exits: {
    invalidMimeType: {
      description: 'The file is not a valid image type',
    },
    fileTooLarge: {
      description: 'The file exceeds the maximum allowed size',
    },
  },

  async fn(inputs, exits) {
    const fileManager = sails.hooks['file-manager'].getInstance();
    const { file, maxSize } = inputs;

    // Check if inline_image table exists before attempting to process upload
    // This prevents errors when the feature hasn't been enabled via migration
    try {
      const tableExists = await sails.sendNativeQuery(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = 'inline_image'
        );`,
      );

      const exists =
        tableExists && tableExists.rows && tableExists.rows[0] && tableExists.rows[0].exists;
      if (!exists) {
        throw new Error('Inline images feature not enabled. Please run database migrations first.');
      }
    } catch (error) {
      sails.log.warn('Inline images feature not available:', error.message);
      await rimraf(file.fd);
      throw error;
    }

    // Convert cardId to string - handle various formats
    let cardId;
    const rawCardId = inputs.cardId;

    if (typeof rawCardId === 'string') {
      cardId = rawCardId;
    } else if (typeof rawCardId === 'number') {
      cardId = String(rawCardId);
    } else if (rawCardId && typeof rawCardId === 'object') {
      if (typeof rawCardId.toString === 'function' && rawCardId.toString() !== '[object Object]') {
        cardId = rawCardId.toString();
      } else if (rawCardId.id !== undefined) {
        cardId = String(rawCardId.id);
      } else {
        cardId = JSON.stringify(rawCardId);
      }
    } else {
      cardId = String(rawCardId);
    }

    let uploadedFileId;
    let filePathSegment;
    let inlineImage;
    try {
      // Detect MIME type from file
      const fileType = await fileTypeFromFile(file.fd);
      const { mime: mimeType = null } = fileType || {};

      if (!mimeType) {
        return exits.invalidMimeType({
          message: 'Could not detect file MIME type',
        });
      }

      const { size } = file;

      // Validate image using helper
      const validation = await sails.helpers.utils
        .validateInlineImage({
          mimeType,
          size,
          maxSize,
        })
        .intercept('invalidMimeType', () => exits.invalidMimeType)
        .intercept('fileTooLarge', () => exits.fileTooLarge);

      const { extension } = validation;

      // Generate unique filename
      const filename = await sails.helpers.utils.generateInlineImageFilename({
        cardId,
        extension,
      });

      // Create UploadedFile record
      ({ id: uploadedFileId } = await UploadedFile.qm.createOne({
        mimeType,
        size,
        type: UploadedFile.Types.ATTACHMENT,
        referencesTotal: 1,
      }));

      // Store file using file manager with atomic write
      filePathSegment = `${sails.config.custom.inlineImagesPathSegment}/${filename}`;

      let buffer;
      try {
        buffer = await fsPromises.readFile(file.fd);
      } catch (error) {
        sails.log.warn('Failed to read uploaded file buffer:', error);
      }

      // Atomically save file
      if (buffer) {
        await fileManager.save(filePathSegment, Readable.from(buffer));
      } else {
        await fileManager.move(file.fd, filePathSegment, file.type);
      }

      // Create InlineImage record for tracking
      inlineImage = await InlineImage.create({
        cardId,
        uploadedFileId,
        filename,
        markdownPath: `pending/${filename}`, // Non-null until the authenticated ID URL is assigned
      }).fetch();

      // Generate authenticated URL path using the inline image ID
      const markdownPath = `api/inline-images/${inlineImage.id}`;

      // Update the record with the markdown path
      await InlineImage.updateOne(inlineImage.id, { markdownPath });

      // Clean up temp file if move was successful
      await rimraf(file.fd);

      return exits.success({
        id: inlineImage.id,
        uploadedFileId,
        filename,
        markdownPath,
        mimeType,
        size,
        url: `/${markdownPath}`,
      });
    } catch (error) {
      sails.log.error('Error processing inline image:', error);
      const rollback = [];
      if (inlineImage) rollback.push(() => InlineImage.destroyOne(inlineImage.id));
      if (filePathSegment) rollback.push(() => fileManager.delete(filePathSegment));
      if (uploadedFileId) rollback.push(() => UploadedFile.qm.deleteOne(uploadedFileId));
      await rollback.reduce(async (previous, undo) => {
        await previous;
        try {
          await undo();
        } catch (rollbackError) {
          sails.log.warn('Inline image rollback failed:', rollbackError);
        }
      }, Promise.resolve());

      // Clean up temp file on error
      try {
        await rimraf(file.fd);
      } catch (cleanupError) {
        sails.log.warn('Failed to cleanup temp file:', cleanupError);
      }

      throw error;
    }
  },
};
