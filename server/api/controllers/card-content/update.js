/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

/**
 * @swagger
 * /cards/{cardId}/content:
 *   put:
 *     summary: Update card content
 *     description: Updates the content for a card. Creates a new version in the file-based content system.
 *     tags:
 *       - CardContent
 *     operationId: updateCardContent
 *     parameters:
 *       - name: cardId
 *         in: path
 *         required: true
 *         description: ID of the card to update content for
 *         schema:
 *           type: string
 *           example: "1357158568008091264"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 description: The new card content
 *                 example: "# Updated Card\n\nNew content here..."
 *               contentType:
 *                 type: string
 *                 enum: [markdown, html, json, prosemirror, slate]
 *                 default: markdown
 *                 description: Type of content
 *                 example: markdown
 *               requestId:
 *                 type: string
 *                 maxLength: 128
 *                 description: Request ID for tracking
 *                 example: req_123456
 *     responses:
 *       200:
 *         description: Card content updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - cardContent
 *               properties:
 *                 cardContent:
 *                   $ref: '#/components/schemas/CardContent'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       413:
 *         description: Content too large
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - error
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Content too large
 */

const { idInput } = require('../../../utils/inputs');

const Errors = {
  NOT_ENOUGH_RIGHTS: {
    notEnoughRights: 'Not enough rights',
  },
  CARD_NOT_FOUND: {
    cardNotFound: 'Card not found',
  },
  CONTENT_TOO_LARGE: {
    contentTooLarge: 'Content too large',
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
    contentTooLarge: {
      responseType: 'payloadTooLarge',
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

    // Check content size limit (default 10GB, but configurable)
    const maxContentSize =
      sails.config.custom.maxCardContentSize || 10 * 1024 * 1024 * 1024; // 10GB
    const contentSize = Buffer.byteLength(inputs.content, 'utf-8');

    if (contentSize > maxContentSize) {
      throw Errors.CONTENT_TOO_LARGE;
    }

    // Create or update card content
    const cardContent = await sails.helpers.cardContent.createOrUpdateOne({
      cardId: inputs.cardId,
      content: inputs.content,
      contentType: inputs.contentType,
    });

    // Broadcast to board subscribers
    sails.sockets.broadcast(
      `board:${board.id}`,
      'cardContentUpdate',
      {
        cardId: card.id,
        version: cardContent.version,
        size: cardContent.size,
        requestId: inputs.requestId,
      },
      this.req,
    );

    return exits.success({
      cardContent: {
        id: cardContent.id,
        cardId: cardContent.cardId,
        contentType: cardContent.contentType,
        version: cardContent.version,
        size: cardContent.size,
        createdAt: cardContent.createdAt,
        updatedAt: cardContent.updatedAt,
      },
    });
  },
};
