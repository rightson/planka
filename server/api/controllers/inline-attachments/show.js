/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

/**
 * @swagger
 * /inline-attachments/{contentId}:
 *   get:
 *     summary: Get inline attachment file
 *     description: Retrieves the actual file content of an inline attachment. Returns the image/file data.
 *     tags:
 *       - InlineAttachments
 *     operationId: getInlineAttachment
 *     parameters:
 *       - name: contentId
 *         in: path
 *         required: true
 *         description: Content ID of the inline attachment
 *         schema:
 *           type: string
 *           example: "a1b2c3d4e5f6"
 *     responses:
 *       200:
 *         description: Inline attachment file
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

const Errors = {
  INLINE_ATTACHMENT_NOT_FOUND: {
    inlineAttachmentNotFound: 'Inline attachment not found',
  },
};

module.exports = {
  inputs: {
    contentId: {
      type: 'string',
      required: true,
    },
  },

  exits: {
    inlineAttachmentNotFound: {
      responseType: 'notFound',
    },
  },

  async fn(inputs) {
    const { currentUser } = this.req;

    // Find inline attachment by contentId
    const inlineAttachment = await InlineAttachment.findOne({
      contentId: inputs.contentId,
    });

    if (!inlineAttachment) {
      throw Errors.INLINE_ATTACHMENT_NOT_FOUND;
    }

    // Check permissions - user must have access to the card's board
    const { board } = await sails.helpers.cards
      .getPathToProjectById(inlineAttachment.cardId)
      .intercept('pathNotFound', () => Errors.INLINE_ATTACHMENT_NOT_FOUND);

    const boardMembership = await BoardMembership.qm.getOneByBoardIdAndUserId(
      board.id,
      currentUser.id,
    );

    if (!boardMembership) {
      throw Errors.INLINE_ATTACHMENT_NOT_FOUND; // Forbidden
    }

    // Get uploaded file info
    const uploadedFile = await UploadedFile.findOne({ id: inlineAttachment.uploadedFileId });

    if (!uploadedFile) {
      throw Errors.INLINE_ATTACHMENT_NOT_FOUND;
    }

    // Determine file extension from MIME type
    const extension = uploadedFile.mimeType ? uploadedFile.mimeType.split('/')[1] : 'png';

    // Construct file path: private/inline-attachments/{uploadedFileId}/pasted-image-{contentId}.{ext}
    const filePathSegment = `private/inline-attachments/${uploadedFile.id}/pasted-image-${inlineAttachment.contentId}.${extension}`;

    // Stream the file from storage
    const fileManager = sails.hooks.fileManager.getInstance();

    try {
      const stream = await fileManager.readInlineAttachment(filePathSegment);

      // Set response headers
      this.res.set('Content-Type', uploadedFile.mimeType || 'application/octet-stream');
      this.res.set(
        'Content-Disposition',
        `inline; filename="pasted-image-${inlineAttachment.contentId}.${extension}"`,
      );
      this.res.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

      // Stream the file
      stream.pipe(this.res);

      // Return to prevent Sails from sending default response
      return;
    } catch (error) {
      sails.log.error('Failed to stream inline attachment:', error);
      throw Errors.INLINE_ATTACHMENT_NOT_FOUND;
    }
  },
};
