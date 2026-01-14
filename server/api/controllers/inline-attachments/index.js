/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

/**
 * @swagger
 * /cards/{cardId}/inline-attachments:
 *   get:
 *     summary: List inline attachments
 *     description: Lists all inline attachments for a card. Returns both active and inactive inline attachments.
 *     tags:
 *       - InlineAttachments
 *     operationId: listInlineAttachments
 *     parameters:
 *       - name: cardId
 *         in: path
 *         required: true
 *         description: ID of the card to list inline attachments for
 *         schema:
 *           type: string
 *           example: "1357158568008091264"
 *     responses:
 *       200:
 *         description: Inline attachments retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - items
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/InlineAttachment'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
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

  async fn(inputs) {
    const { currentUser } = this.req;

    const { board } = await sails.helpers.cards
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
      cardId: inputs.cardId,
    })
      .populate('uploadedFileId')
      .sort('position ASC');

    // Present each inline attachment with its file data
    const items = [];
    for (const inlineAttachment of inlineAttachments) {
      const uploadedFile = inlineAttachment.uploadedFileId;

      // Get file data from uploaded_file
      const data = {
        uploadedFileId: uploadedFile.id,
        filename: `inline-${inlineAttachment.contentId}`, // We don't store filename separately
        mimeType: uploadedFile.mimeType,
        size: uploadedFile.size,
      };

      items.push(
        sails.helpers.inlineAttachments.presentOne({
          inlineAttachment,
          data,
        }),
      );
    }

    return {
      items,
    };
  },
};
