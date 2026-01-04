/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

/**
 * @swagger
 * /cards/{cardId}/inline-images:
 *   post:
 *     summary: Upload inline image
 *     description: Upload an image for inline embedding in card descriptions. Requires board editor permissions.
 *     tags:
 *       - Inline Images
 *     operationId: uploadInlineImage
 *     parameters:
 *       - name: cardId
 *         in: path
 *         required: true
 *         description: ID of the card to upload the image for
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
 *                 description: Image file to upload (max 10MB)
 *               maxSize:
 *                 type: number
 *                 description: Maximum file size in bytes (default 10MB)
 *     responses:
 *       200:
 *         description: Image uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 markdownPath:
 *                   type: string
 *                   description: Path to use in markdown
 *                   example: uploads/card-123-image-2026-01-04T12-30-45-abc12345.png
 *                 url:
 *                   type: string
 *                   description: Public URL to access the image
 *                   example: /uploads/card-123-image-2026-01-04T12-30-45-abc12345.png
 *                 filename:
 *                   type: string
 *                   description: Generated filename
 *                   example: card-123-image-2026-01-04T12-30-45-abc12345.png
 *                 mimeType:
 *                   type: string
 *                   description: MIME type of the uploaded file
 *                   example: image/png
 *                 size:
 *                   type: number
 *                   description: File size in bytes
 *                   example: 1572864
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       422:
 *         description: Upload or validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: string
 *                   example: E_UNPROCESSABLE_ENTITY
 *                 message:
 *                   type: string
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
  INVALID_IMAGE_TYPE: {
    invalidImageType: 'Invalid image type',
  },
  FILE_TOO_LARGE: {
    fileTooLarge: 'File too large',
  },
};

module.exports = {
  inputs: {
    cardId: {
      ...idInput,
      required: true,
    },
    maxSize: {
      type: 'number',
      defaultsTo: 10 * 1024 * 1024, // 10MB
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
    invalidImageType: {
      responseType: 'unprocessableEntity',
    },
    fileTooLarge: {
      responseType: 'unprocessableEntity',
    },
  },

  async fn(inputs, exits) {
    const { currentUser } = this.req;

    // Get card and verify permissions
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

    // Process inline image
    let result;
    try {
      result = await sails.helpers.inlineImages.processUploadedFile({
        cardId: inputs.cardId,
        file,
        maxSize: inputs.maxSize,
      });
    } catch (error) {
      if (error.exit === 'invalidMimeType') {
        return exits.invalidImageType(error.output);
      }
      if (error.exit === 'fileTooLarge') {
        return exits.fileTooLarge(error.output);
      }
      throw error;
    }

    return exits.success({
      markdownPath: result.markdownPath,
      url: result.url,
      filename: result.filename,
      mimeType: result.mimeType,
      size: result.size,
    });
  },
};
