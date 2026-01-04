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
    // Extract base64 images from markdown content
    // Matches patterns like: ![alt](data:image/png;base64,iVBORw0KG...)
    const base64Regex = /!\[([^\]]*)]\(data:(image\/[\w+.-]+);base64,([A-Za-z0-9+/=]+)\)/g;
    const images = [];

    let match;
    while ((match = base64Regex.exec(inputs.content)) !== null) {
      images.push({
        original: match[0], // Full match for replacement
        altText: match[1] || null,
        mimeType: match[2],
        data: match[3],
      });
    }

    return images;
  },
};
