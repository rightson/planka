/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

/**
 * @swagger
 * /cards/{cardId}/content:
 *   get:
 *     summary: Get card content
 *     description: Retrieves the content for a card. Returns either new file-based content or legacy description field.
 *     tags:
 *       - CardContent
 *     operationId: getCardContent
 *     parameters:
 *       - name: cardId
 *         in: path
 *         required: true
 *         description: ID of the card to get content for
 *         schema:
 *           type: string
 *           example: "1357158568008091264"
 *       - name: version
 *         in: query
 *         required: false
 *         description: Specific content version to retrieve (defaults to latest)
 *         schema:
 *           type: number
 *           example: 1
 *     responses:
 *       200:
 *         description: Card content retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - content
 *                 - contentType
 *                 - version
 *                 - size
 *                 - inlineAttachments
 *                 - contentMigrated
 *               properties:
 *                 content:
 *                   type: string
 *                   description: The card content (markdown, html, etc.)
 *                   example: "# My Card\n\nHere's an image:\n\n![Screenshot](inline://img_abc123)"
 *                 contentType:
 *                   type: string
 *                   enum: [markdown, html, json, prosemirror, slate]
 *                   description: Type of content
 *                   example: markdown
 *                 version:
 *                   type: number
 *                   description: Content version number
 *                   example: 5
 *                 size:
 *                   type: number
 *                   description: Content size in bytes
 *                   example: 12345
 *                 inlineAttachments:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/InlineAttachment'
 *                 contentMigrated:
 *                   type: boolean
 *                   description: Whether this card has been migrated to the new content system
 *                   example: true
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
    version: {
      type: 'number',
      min: 1,
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

    // Get card content using helper
    const contentData = await sails.helpers.cardContent.getOne({
      cardId: inputs.cardId,
      version: inputs.version,
    });

    // Present inline attachments with full data
    const presentedInlineAttachments = [];
    for (const inlineAttachment of contentData.inlineAttachments) {
      const uploadedFile = inlineAttachment.uploadedFileId;

      const data = {
        uploadedFileId: uploadedFile.id,
        filename: `inline-${inlineAttachment.contentId}`,
        mimeType: uploadedFile.mimeType,
        size: uploadedFile.size,
      };

      presentedInlineAttachments.push(
        sails.helpers.inlineAttachments.presentOne({
          inlineAttachment,
          data,
        }),
      );
    }

    return {
      content: contentData.content,
      contentType: contentData.contentType,
      version: contentData.version,
      size: contentData.size,
      inlineAttachments: presentedInlineAttachments,
      contentMigrated: contentData.contentMigrated,
    };
  },
};
