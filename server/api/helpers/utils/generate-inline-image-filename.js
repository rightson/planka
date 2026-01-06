const crypto = require('crypto');
const path = require('path');

/**
 * Generate a unique, URL-safe filename for inline images
 * Format: card-{cardId}-image-{timestamp}-{randomSuffix}.{ext}
 *
 * @param {string} cardId - The card ID
 * @param {string} extension - File extension (e.g., 'png', 'jpg')
 * @returns {string} Generated filename
 */
module.exports = {
  friendlyName: 'Generate inline image filename',

  description: 'Generate a unique, URL-safe filename for inline card images',

  inputs: {
    cardId: {
      type: 'string',
      required: true,
      description: 'The ID of the card',
    },
    extension: {
      type: 'string',
      required: true,
      description: 'File extension (png, jpg, etc)',
    },
  },

  fn(inputs, exits) {
    const { cardId, extension } = inputs;

    // Generate ISO 8601 timestamp without colons (URL-safe)
    const timestamp = new Date()
      .toISOString()
      .replace(/:/g, '-')
      .replace(/\./g, '-');

    // Generate 8-character crypto-random suffix
    const randomSuffix = crypto.randomBytes(4).toString('hex');

    // Sanitize extension (remove leading dot if present)
    const ext = extension.replace(/^\./, '').toLowerCase();

    // Format: card-{cardId}-image-{timestamp}-{randomSuffix}.{ext}
    const filename = `card-${cardId}-image-${timestamp}-${randomSuffix}.${ext}`;

    return exits.success(filename);
  },
};
