/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

module.exports = {
  inputs: {
    content: {
      type: 'string',
      required: true,
    },
  },

  async fn(inputs) {
    // Extract inline attachment references from markdown content
    // Matches patterns like: ![alt](inline://img_abc123)
    const inlineRefRegex = /!\[([^\]]*)]\(inline:\/\/([\w-]+)\)/g;
    const refs = [];
    const refSet = new Set();

    let match;
    while ((match = inlineRefRegex.exec(inputs.content)) !== null) {
      const contentId = match[2];
      if (!refSet.has(contentId)) {
        refSet.add(contentId);
        refs.push({
          contentId,
          altText: match[1] || null,
        });
      }
    }

    return refs;
  },
};
