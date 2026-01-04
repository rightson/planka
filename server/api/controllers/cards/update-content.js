/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

const { idInput } = require('../../../utils/inputs');

const Errors = {
  NOT_ENOUGH_RIGHTS: {
    notEnoughRights: 'Not enough rights',
  },
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
    content: {
      type: 'string',
      required: true,
    },
    contentType: {
      type: 'string',
      isIn: Object.values(CardContent.ContentTypes),
      defaultsTo: CardContent.ContentTypes.MARKDOWN,
    },
  },

  exits: {
    notEnoughRights: {
      responseType: 'forbidden',
    },
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

    if (boardMembership.role !== BoardMembership.Roles.EDITOR) {
      throw Errors.NOT_ENOUGH_RIGHTS;
    }

    // Extract inline attachment references from content
    const inlineRefs = await sails.helpers.cardContent.extractInlineRefs(inputs.content);

    // Get inline attachment IDs
    const inlineAttachmentIds = [];
    if (inlineRefs.length > 0) {
      const contentIds = inlineRefs.map((ref) => ref.contentId);
      const inlineAttachments = await InlineAttachment.find({
        cardId: card.id,
        contentId: { in: contentIds },
      });
      inlineAttachmentIds.push(...inlineAttachments.map((att) => att.id));

      // Update isActive status
      await InlineAttachment.update({
        cardId: card.id,
        contentId: { in: contentIds },
      }).set({ isActive: true });

      // Mark unused attachments as inactive
      await InlineAttachment.update({
        cardId: card.id,
        contentId: { nin: contentIds },
      }).set({ isActive: false });
    } else {
      // No inline refs, mark all as inactive
      await InlineAttachment.update({
        cardId: card.id,
      }).set({ isActive: false });
    }

    // Get current version
    const currentCardContent = await CardContent.findOne({
      cardId: card.id,
    }).sort('version DESC');

    const nextVersion = currentCardContent ? currentCardContent.version + 1 : 1;

    // Save content to file storage
    const { contentRef, contentHash, size } = await sails.helpers.cardContent.saveContent({
      cardId: card.id,
      content: inputs.content,
      version: nextVersion,
      contentType: inputs.contentType,
    });

    // Create CardContent record
    const cardContent = await CardContent.create({
      cardId: card.id,
      contentType: inputs.contentType,
      contentRef,
      contentHash,
      size,
      version: nextVersion,
      inlineAttachmentIds,
    }).fetch();

    // Update card
    await Card.updateOne({ id: card.id }).set({
      contentMigrated: true,
      contentVersion: nextVersion,
    });

    return exits.success({
      item: {
        cardId: card.id,
        content: inputs.content,
        contentType: cardContent.contentType,
        version: cardContent.version,
        size: cardContent.size,
        inlineAttachmentIds,
        updatedAt: cardContent.updatedAt,
      },
    });
  },
};
