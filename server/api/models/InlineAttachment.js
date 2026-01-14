/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

/**
 * InlineAttachment.js
 *
 * @description :: A model for inline attachments (pasted images) within card content.
 *                 Distinguishes from user-uploaded attachments and tracks usage.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     InlineAttachment:
 *       type: object
 *       required:
 *         - id
 *         - cardId
 *         - uploadedFileId
 *         - attachmentType
 *         - source
 *         - contentId
 *         - createdAt
 *         - updatedAt
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the inline attachment
 *           example: "1357158568008091264"
 *         cardId:
 *           type: string
 *           description: ID of the card this inline attachment belongs to
 *           example: "1357158568008091265"
 *         uploadedFileId:
 *           type: string
 *           description: ID of the uploaded file record
 *           example: "1357158568008091266"
 *         attachmentType:
 *           type: string
 *           enum: [inline, uploaded]
 *           default: inline
 *           description: Type of attachment
 *           example: inline
 *         source:
 *           type: string
 *           enum: [paste, drag-drop, file-upload, migration]
 *           default: paste
 *           description: How this attachment was created
 *           example: paste
 *         contentId:
 *           type: string
 *           description: Unique ID for referencing in markdown (e.g., img_abc123)
 *           example: img_abc123
 *         altText:
 *           type: string
 *           nullable: true
 *           description: Alt text for accessibility
 *           example: Screenshot of dashboard
 *         position:
 *           type: number
 *           nullable: true
 *           description: Position for ordering inline attachments
 *           example: 1.5
 *         isActive:
 *           type: boolean
 *           default: true
 *           description: Whether still referenced in current content
 *           example: true
 *         referenceCount:
 *           type: number
 *           default: 1
 *           description: Number of times referenced in content
 *           example: 1
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: When this inline attachment was created
 *           example: 2026-01-02T00:00:00.000Z
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: When this inline attachment was last updated
 *           example: 2026-01-02T00:00:00.000Z
 */

const AttachmentTypes = {
  INLINE: 'inline',
  UPLOADED: 'uploaded',
};

const Sources = {
  PASTE: 'paste',
  DRAG_DROP: 'drag-drop',
  FILE_UPLOAD: 'file-upload',
  MIGRATION: 'migration',
};

module.exports = {
  AttachmentTypes,
  Sources,

  attributes: {
    //  ╔═╗╦═╗╦╔╦╗╦╔╦╗╦╦  ╦╔═╗╔═╗
    //  ╠═╝╠╦╝║║║║║ ║ ║╚╗╔╝║╣ ╚═╗
    //  ╩  ╩╚═╩╩ ╩╩ ╩ ╩ ╚╝ ╚═╝╚═╝

    attachmentType: {
      type: 'string',
      isIn: Object.values(AttachmentTypes),
      defaultsTo: AttachmentTypes.INLINE,
      columnName: 'attachment_type',
    },
    source: {
      type: 'string',
      isIn: Object.values(Sources),
      defaultsTo: Sources.PASTE,
    },
    contentId: {
      type: 'string',
      required: true,
      columnName: 'content_id',
    },
    altText: {
      type: 'string',
      allowNull: true,
      columnName: 'alt_text',
    },
    position: {
      type: 'number',
      allowNull: true,
    },
    isActive: {
      type: 'boolean',
      defaultsTo: true,
      columnName: 'is_active',
    },
    referenceCount: {
      type: 'number',
      defaultsTo: 1,
      columnName: 'reference_count',
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
