/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

const fsPromises = require('fs').promises;
const path = require('path');
const { rimraf } = require('rimraf');
const { fileTypeFromFile } = require('file-type');

module.exports = {
  inputs: {
    cardId: {
      type: 'string',
      required: true,
      description: 'The ID of the card',
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
    const { cardId, file, maxSize } = inputs;

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
      const validation = await sails.helpers.utils.validateInlineImage({
        mimeType,
        size,
        maxSize,
      }).intercept('invalidMimeType', () => exits.invalidMimeType)
        .intercept('fileTooLarge', () => exits.fileTooLarge);

      const { extension } = validation;

      // Generate unique filename
      const filename = await sails.helpers.utils.generateInlineImageFilename({
        cardId,
        extension,
      });

      // Create UploadedFile record
      const { id: uploadedFileId } = await UploadedFile.qm.createOne({
        mimeType,
        size,
        type: UploadedFile.Types.ATTACHMENT,
      });

      // Increment reference count
      await UploadedFile.qm.update({
        id: uploadedFileId,
      }, {
        referencesTotal: 1,
      });

      // Store file using file manager with atomic write
      const filePathSegment = `${sails.config.custom.inlineImagesPathSegment}/${filename}`;

      let buffer;
      try {
        buffer = await fsPromises.readFile(file.fd);
      } catch (error) {
        sails.log.warn('Failed to read uploaded file buffer:', error);
      }

      // Atomically save file
      let filePath;
      if (buffer) {
        await fileManager.save(filePathSegment, buffer, file.type);
        filePath = filePathSegment;
      } else {
        filePath = await fileManager.move(file.fd, filePathSegment, file.type);
      }

      // Create InlineImage record for tracking
      const markdownPath = `uploads/${filename}`;
      const inlineImage = await InlineImage.qm.create({
        cardId,
        uploadedFileId,
        filename,
        markdownPath,
      }).fetch();

      // Clean up temp file if move was successful
      if (!filePath) {
        await rimraf(file.fd);
      }

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
