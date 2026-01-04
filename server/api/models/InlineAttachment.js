/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

/**
 * InlineAttachment.js
 *
 * @description :: Model for storing pasted/inline images separately from card content
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */

const AttachmentTypes = {
  INLINE: 'inline',
  UPLOADED: 'uploaded',
};

const Sources = {
  PASTE: 'paste',
  DRAG_DROP: 'drag-drop',
  MIGRATION: 'migration',
  UPLOAD: 'upload',
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
      required: true,
      defaultsTo: AttachmentTypes.INLINE,
      columnName: 'attachment_type',
    },
    source: {
      type: 'string',
      isIn: Object.values(Sources),
      required: true,
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
      columnType: 'double precision',
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
