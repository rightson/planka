/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

/**
 * @swagger
 * /inline-images/{id}:
 *   get:
 *     summary: Download inline image
 *     description: Download an inline image. Requires board membership to access.
 *     tags:
 *       - Inline Images
 *     operationId: downloadInlineImage
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: ID of the inline image
 *         schema:
 *           type: string
 *           example: "1357158568008091264"
 *     responses:
 *       200:
 *         description: Image file
 *         content:
 *           image/*:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */

const { idInput } = require('../../../utils/inputs');

const Errors = {
  NOT_ENOUGH_RIGHTS: {
    notEnoughRights: 'Not enough rights',
  },
  INLINE_IMAGE_NOT_FOUND: {
    inlineImageNotFound: 'Inline image not found',
  },
};

module.exports = {
  inputs: {
    id: {
      ...idInput,
      required: true,
    },
  },

  exits: {
    notEnoughRights: {
      responseType: 'forbidden',
    },
    inlineImageNotFound: {
      responseType: 'notFound',
    },
  },

  async fn(inputs, exits) {
    const { currentUser } = this.req;

    // Get inline image record
    const inlineImage = await InlineImage.qm.getOne(inputs.id);

    if (!inlineImage) {
      throw Errors.INLINE_IMAGE_NOT_FOUND;
    }

    // Get card and board to verify permissions
    const { board } = await sails.helpers.cards
      .getPathToProjectById(inlineImage.cardId)
      .intercept('pathNotFound', () => Errors.INLINE_IMAGE_NOT_FOUND);

    // Verify user has access to the board
    const boardMembership = await BoardMembership.qm.getOneByBoardIdAndUserId(
      board.id,
      currentUser.id,
    );

    if (!boardMembership) {
      throw Errors.NOT_ENOUGH_RIGHTS;
    }

    // Get uploaded file info
    const uploadedFile = await UploadedFile.qm.getOne(inlineImage.uploadedFileId);

    if (!uploadedFile) {
      throw Errors.INLINE_IMAGE_NOT_FOUND;
    }

    // Build file path
    const filePathSegment = `${sails.config.custom.inlineImagesPathSegment}/${inlineImage.filename}`;

    // Stream the file
    const fileManager = sails.hooks['file-manager'].getInstance();

    let stream;
    try {
      stream = await fileManager.read(filePathSegment);
    } catch (error) {
      sails.log.error('Error reading inline image file:', error);
      throw Errors.INLINE_IMAGE_NOT_FOUND;
    }

    // Set response headers
    this.res.set('Content-Type', uploadedFile.mimeType);
    this.res.set('Content-Length', uploadedFile.size);
    this.res.set('Cache-Control', 'private, max-age=31536000'); // Cache for 1 year (immutable files)

    // Stream file to response
    return exits.success(stream);
  },
};
