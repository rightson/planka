/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

/**
 * CardContent.js
 *
 * @description :: A model for storing large card content in files (not database).
 *                 Supports 10GB+ content with versioning and inline attachment tracking.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     CardContent:
 *       type: object
 *       required:
 *         - id
 *         - cardId
 *         - contentType
 *         - contentRef
 *         - size
 *         - version
 *         - createdAt
 *         - updatedAt
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the card content
 *           example: "1357158568008091264"
 *         cardId:
 *           type: string
 *           description: ID of the card this content belongs to
 *           example: "1357158568008091265"
 *         contentType:
 *           type: string
 *           description: Type of content stored
 *           enum: [markdown, html, json, prosemirror, slate]
 *           default: markdown
 *           example: markdown
 *         contentRef:
 *           type: string
 *           description: File path or S3 key where content is stored
 *           example: card-content/1357158568008091265/v1.md
 *         contentHash:
 *           type: string
 *           nullable: true
 *           description: SHA256 hash for deduplication
 *           example: abc123def456...
 *         size:
 *           type: number
 *           description: Content size in bytes
 *           example: 1048576
 *         version:
 *           type: number
 *           description: Version number for this content
 *           default: 1
 *           example: 1
 *         encoding:
 *           type: string
 *           description: Text encoding
 *           default: utf-8
 *           example: utf-8
 *         inlineAttachmentIds:
 *           type: array
 *           items:
 *             type: string
 *           description: IDs of inline attachments referenced in this content
 *           example: ["1357158568008091266", "1357158568008091267"]
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: When this content version was created
 *           example: 2026-01-02T00:00:00.000Z
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: When this content version was last updated
 *           example: 2026-01-02T00:00:00.000Z
 */

const ContentTypes = {
  MARKDOWN: 'markdown',
  HTML: 'html',
  JSON: 'json',
  PROSEMIRROR: 'prosemirror',
  SLATE: 'slate',
};

module.exports = {
  ContentTypes,

  attributes: {
    //  ╔═╗╦═╗╦╔╦╗╦╔╦╗╦╦  ╦╔═╗╔═╗
    //  ╠═╝╠╦╝║║║║║ ║ ║╚╗╔╝║╣ ╚═╗
    //  ╩  ╩╚═╩╩ ╩╩ ╩ ╩ ╚╝ ╚═╝╚═╝

    contentType: {
      type: 'string',
      isIn: Object.values(ContentTypes),
      defaultsTo: ContentTypes.MARKDOWN,
      columnName: 'content_type',
    },
    contentRef: {
      type: 'string',
      required: true,
      columnName: 'content_ref',
    },
    contentHash: {
      type: 'string',
      allowNull: true,
      columnName: 'content_hash',
    },
    size: {
      type: 'number',
      required: true,
    },
    version: {
      type: 'number',
      defaultsTo: 1,
    },
    encoding: {
      type: 'string',
      defaultsTo: 'utf-8',
    },
    inlineAttachmentIds: {
      type: 'json',
      columnType: 'bigint[]',
      columnName: 'inline_attachment_ids',
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
  },
};
