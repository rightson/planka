/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

const crypto = require('crypto');
const fsPromises = require('fs').promises;
const { Readable } = require('stream');
const { fileTypeFromFile } = require('file-type');
const { idInput } = require('../../../utils/inputs');

const Errors = {
  NOT_ENOUGH_RIGHTS: {
    notEnoughRights: 'Not enough rights',
  },
  CARD_NOT_FOUND: {
    cardNotFound: 'Card not found',
  },
  NO_FILE_WAS_UPLOADED: {
    noFileWasUploaded: 'No file was uploaded',
  },
};

/**
 * Generate a unique content ID for inline attachments
 */
function generateContentId() {
  return `img_${crypto.randomBytes(8).toString('hex')}`;
}

module.exports = {
  inputs: {
    cardId: {
      ...idInput,
      required: true,
    },
    source: {
      type: 'string',
      isIn: Object.values(InlineAttachment.Sources),
      defaultsTo: InlineAttachment.Sources.PASTE,
    },
    altText: {
      type: 'string',
      maxLength: 256,
      allowNull: true,
    },
    requestId: {
      type: 'string',
      isNotEmptyString: true,
      maxLength: 128,
    },
  },

  exits: {
    notEnoughRights: {
      responseType: 'forbidden',
    },
    cardNotFound: {
      responseType: 'notFound',
    },
    noFileWasUploaded: {
      responseType: 'unprocessableEntity',
    },
    uploadError: {
      responseType: 'unprocessableEntity',
    },
  },

  async fn(inputs, exits) {
    const { currentUser } = this.req;

    const { card, board } = await sails.helpers.cards
      .getPathToProjectById(inputs.cardId)
      .intercept('pathNotFound', () => Errors.CARD_NOT_FOUND);

    const boardMembership = await BoardMembership.qm.getOneByBoardIdAndUserId(
      board.id,
      currentUser.id,
    );

    if (!boardMembership) {
      throw Errors.CARD_NOT_FOUND; // Forbidden
    }

    if (boardMembership.role !== BoardMembership.Roles.EDITOR) {
      throw Errors.NOT_ENOUGH_RIGHTS;
    }

    // Receive uploaded file
    let files;
    try {
      files = await sails.helpers.utils.receiveFile(this.req.file('file'));
    } catch (error) {
      return exits.uploadError(error.message);
    }

    if (files.length === 0) {
      throw Errors.NO_FILE_WAS_UPLOADED;
    }

    const file = _.last(files);
    const fileManager = sails.hooks['file-manager'].getInstance();

    try {
      // Read file and detect type
      const buffer = await fsPromises.readFile(file.fd);
      const fileType = await fileTypeFromFile(file.fd);
      const { mime: mimeType = 'application/octet-stream' } = fileType || {};

      // Calculate hash for deduplication
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');

      // Check if file with same hash already exists
      let uploadedFile = await UploadedFile.findOne({
        type: 'attachment',
        hash,
      });

      if (!uploadedFile) {
        // Create new UploadedFile record
        uploadedFile = await UploadedFile.create({
          type: 'attachment',
          mimeType,
          size: buffer.length,
          referencesTotal: 1,
          hash,
        }).fetch();

        // Save file to storage
        const filename = file.filename || `image.${fileType?.ext || 'png'}`;
        const filePathSegment = `private/inline-attachments/${uploadedFile.id}/${filename}`;
        const stream = Readable.from([buffer]);
        await fileManager.save(filePathSegment, stream);
      } else {
        // File already exists, increment reference count
        await UploadedFile.updateOne({ id: uploadedFile.id }).set({
          referencesTotal: uploadedFile.referencesTotal + 1,
        });
      }

      // Generate unique content ID
      const contentId = generateContentId();

      // Create InlineAttachment record
      const inlineAttachment = await InlineAttachment.create({
        cardId: card.id,
        uploadedFileId: uploadedFile.id,
        attachmentType: InlineAttachment.AttachmentTypes.INLINE,
        source: inputs.source,
        contentId,
        altText: inputs.altText || null,
      }).fetch();

      // Build URL for the inline attachment
      const url = fileManager.buildUrl(
        `inline-attachments/${uploadedFile.id}/${file.filename || `image.${fileType?.ext || 'png'}`}`,
      );

      return exits.success({
        item: {
          id: inlineAttachment.id,
          cardId: inlineAttachment.cardId,
          contentId: inlineAttachment.contentId,
          url,
          mimeType,
          size: buffer.length,
          altText: inlineAttachment.altText,
          source: inlineAttachment.source,
          isActive: inlineAttachment.isActive,
          createdAt: inlineAttachment.createdAt,
        },
      });
    } catch (error) {
      sails.log.error('Error creating inline attachment:', error);
      return exits.uploadError(error.message);
    }
  },
};
