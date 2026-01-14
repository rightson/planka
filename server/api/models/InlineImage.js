/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

/**
 * InlineImage.js
 *
 * @description :: Model for tracking inline images embedded in card descriptions
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     InlineImage:
 *       type: object
 *       required:
 *         - id
 *         - cardId
 *         - uploadedFileId
 *         - filename
 *         - markdownPath
 *         - createdAt
 *         - updatedAt
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the inline image
 *         cardId:
 *           type: string
 *           description: ID of the card containing the image
 *         uploadedFileId:
 *           type: string
 *           description: ID of the uploaded file record
 *         filename:
 *           type: string
 *           description: Generated filename for the image
 *         markdownPath:
 *           type: string
 *           description: Path used in markdown (e.g., uploads/card-123-image-...)
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: When the image was uploaded
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: When the record was last updated
 */

module.exports = {
  attributes: {
    //  ╔═╗╦═╗╦╔╦╗╦╔╦╗╦╦  ╦╔═╗╔═╗
    //  ╠═╝╠╦╝║║║║║ ║ ║╚╗╔╝║╣ ╚═╗
    //  ╩  ╩╚═╩╩ ╩╩ ╩ ╩ ╚╝ ╚═╝╚═╝

    filename: {
      type: 'string',
      required: true,
      description: 'Generated unique filename',
    },
    markdownPath: {
      type: 'string',
      required: true,
      description: 'Path used in markdown image syntax',
      columnName: 'markdown_path',
    },

    //  ╔═╗╔╦╗╔╗ ╔═╗╔╦╗╔═╗
    //  ║╣ ║║║╠╩╗║╣  ║║╚═╗
    //  ╚═╝╩ ╩╚═╝╚═╝═╩╝╚═╝

    //  ╔═╗╔═╗╔═╗╔═╗╔═╗╦╔═╗╔╦╗╦╔═╗╔╗╔╔═╗
    //  ╠═╣╚═╗╚═╗║ ║║  ║╠═╣ ║ ║║ ║║║║╚═╗
    //  ╩ ╩╚═╝╚═╝╚═╝╚═╝╩╩ ╩ ╩ ╩╚═╝╝╚╝╚═╝

    cardId: {
      model: 'Card',
      required: true,
      columnName: 'card_id',
    },
    uploadedFileId: {
      model: 'UploadedFile',
      required: true,
      columnName: 'uploaded_file_id',
    },
  },
};
