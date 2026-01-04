/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

module.exports = {
  inputs: {
    contentRef: {
      type: 'string',
      required: true,
    },
  },

  async fn(inputs) {
    const fileManager = sails.hooks['file-manager'].getInstance();

    try {
      const stream = await fileManager.read(inputs.contentRef);

      // Convert stream to string
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks).toString('utf-8');
    } catch (error) {
      sails.log.error('Error reading card content:', error);
      throw new Error('Failed to read card content');
    }
  },
};
