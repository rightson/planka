/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

const { idInput } = require('../../../utils/inputs');

const Errors = {
  CARD_NOT_FOUND: {
    cardNotFound: 'Card not found',
  },
  CONTENT_NOT_FOUND: {
    contentNotFound: 'Content not found',
  },
};

module.exports = {
  inputs: {
    cardId: {
      ...idInput,
      required: true,
    },
    version: {
      type: 'number',
      min: 1,
    },
  },

  exits: {
    cardNotFound: {
      responseType: 'notFound',
    },
    contentNotFound: {
      responseType: 'notFound',
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

    let content;
    let inlineAttachments = [];
    let cardContent;

    if (card.contentMigrated) {
      // NEW SYSTEM: Load from file storage
      const query = { cardId: card.id };
      if (inputs.version) {
        query.version = inputs.version;
      } else {
        query.version = card.contentVersion;
      }

      cardContent = await CardContent.findOne(query);

      if (!cardContent) {
        throw Errors.CONTENT_NOT_FOUND;
      }

      // Read content from file storage
      content = await sails.helpers.cardContent.readContent(cardContent.contentRef);

      // Load inline attachments
      if (cardContent.inlineAttachmentIds && cardContent.inlineAttachmentIds.length > 0) {
        const inlineAtts = await InlineAttachment.find({
          id: { in: cardContent.inlineAttachmentIds },
        }).populate('uploadedFileId');

        const fileManager = sails.hooks['file-manager'].getInstance();

        inlineAttachments = inlineAtts.map((att) => ({
          id: att.id,
          contentId: att.contentId,
          url: fileManager.buildUrl(`inline-attachments/${att.uploadedFileId.id}/`),
          mimeType: att.uploadedFileId.mimeType,
          size: att.uploadedFileId.size,
          altText: att.altText,
          isActive: att.isActive,
        }));
      }
    } else {
      // OLD SYSTEM: Use description field
      content = card.description || '';
    }

    return exits.success({
      item: {
        cardId: card.id,
        content,
        contentType: cardContent ? cardContent.contentType : 'markdown',
        version: cardContent ? cardContent.version : 0,
        size: cardContent ? cardContent.size : Buffer.byteLength(content, 'utf-8'),
        inlineAttachments,
        contentMigrated: card.contentMigrated,
        updatedAt: cardContent ? cardContent.updatedAt : card.updatedAt,
      },
    });
  },
};
