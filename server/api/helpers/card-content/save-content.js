/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

const crypto = require('crypto');
const { Readable } = require('stream');

module.exports = {
  inputs: {
    cardId: {
      type: 'string',
      required: true,
    },
    content: {
      type: 'string',
      required: true,
    },
    version: {
      type: 'number',
      required: true,
    },
    contentType: {
      type: 'string',
      defaultsTo: 'markdown',
    },
  },

  async fn(inputs) {
    const fileManager = sails.hooks['file-manager'].getInstance();

    // Calculate content hash for deduplication
    const contentHash = crypto.createHash('sha256').update(inputs.content).digest('hex');

    // Create file path
    const contentRef = `private/card-content/${inputs.cardId}/v${inputs.version}.md`;

    // Save content to file storage
    const stream = Readable.from([inputs.content]);
    await fileManager.save(contentRef, stream);

    // Calculate size
    const size = Buffer.byteLength(inputs.content, 'utf-8');

    return {
      contentRef,
      contentHash,
      size,
    };
  },
};
