/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

const { idInput } = require('../../../utils/inputs');

const Errors = {
  CARD_NOT_FOUND: {
    cardNotFound: 'Card not found',
  },
};

module.exports = {
  inputs: {
    cardId: {
      ...idInput,
      required: true,
    },
  },

  exits: {
    cardNotFound: {
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

    // Get all inline attachments for the card
    const inlineAttachments = await InlineAttachment.find({
      cardId: card.id,
    }).populate('uploadedFileId');

    const fileManager = sails.hooks['file-manager'].getInstance();

    // Format response
    const items = inlineAttachments.map((att) => ({
      id: att.id,
      cardId: att.cardId,
      contentId: att.contentId,
      url: fileManager.buildUrl(`inline-attachments/${att.uploadedFileId.id}/`),
      mimeType: att.uploadedFileId.mimeType,
      size: att.uploadedFileId.size,
      altText: att.altText,
      source: att.source,
      isActive: att.isActive,
      referenceCount: att.referenceCount,
      createdAt: att.createdAt,
      updatedAt: att.updatedAt,
    }));

    return exits.success({
      items,
    });
  },
};
