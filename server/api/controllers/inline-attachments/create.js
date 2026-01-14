/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

/**
 * @swagger
 * /cards/{cardId}/inline-attachments:
 *   post:
 *     summary: Create inline attachment
 *     description: Creates an inline attachment (pasted image) on a card. Requires board editor permissions.
 *     tags:
 *       - InlineAttachments
 *     operationId: createInlineAttachment
 *     parameters:
 *       - name: cardId
 *         in: path
 *         required: true
 *         description: ID of the card to create the inline attachment on
 *         schema:
 *           type: string
 *           example: "1357158568008091264"
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Image file to upload
 *               source:
 *                 type: string
 *                 enum: [paste, drag-drop, file-upload]
 *                 description: Source of the inline attachment
 *                 default: paste
 *                 example: paste
 *               altText:
 *                 type: string
 *                 maxLength: 256
 *                 description: Alt text for accessibility
 *                 example: Screenshot of dashboard
 *               requestId:
 *                 type: string
 *                 maxLength: 128
 *                 description: Request ID for tracking
 *                 example: req_123456
 *     responses:
 *       201:
 *         description: Inline attachment created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - item
 *               properties:
 *                 item:
 *                   $ref: '#/components/schemas/InlineAttachment'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       422:
 *         description: Upload error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - code
 *                 - message
 *               properties:
 *                 code:
 *                   type: string
 *                   description: Error code
 *                   example: E_UNPROCESSABLE_ENTITY
 *                 message:
 *                   type: string
 *                   enum:
 *                     - No file was uploaded
 *                   description: Specific error message
 *                   example: No file was uploaded
 */

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

    // Process and upload inline attachment
    const { inlineAttachment, data } = await sails.helpers.inlineAttachments.processUploadedFile({
      file,
      cardId: inputs.cardId,
      source: inputs.source,
      altText: inputs.altText,
    });

    // Broadcast to board subscribers
    sails.sockets.broadcast(
      `board:${board.id}`,
      'inlineAttachmentCreate',
      {
        item: sails.helpers.inlineAttachments.presentOne({
          inlineAttachment,
          data,
        }),
        requestId: inputs.requestId,
      },
      this.req,
    );

    return exits.success({
      item: sails.helpers.inlineAttachments.presentOne({
        inlineAttachment,
        data,
      }),
    });
  },
};
