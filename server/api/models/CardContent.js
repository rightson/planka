/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

/**
 * CardContent.js
 *
 * @description :: Model for storing large card content in file storage
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */

const ContentTypes = {
  MARKDOWN: 'markdown',
  HTML: 'html',
  JSON: 'json',
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
      required: true,
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
      required: true,
      defaultsTo: 1,
    },
    encoding: {
      type: 'string',
      defaultsTo: 'utf-8',
    },
    inlineAttachmentIds: {
      type: 'json',
      columnType: 'array',
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
