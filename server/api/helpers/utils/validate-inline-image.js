const path = require('path');

// Allowed image MIME types
const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/avif',
];

// Extension mapping
const MIME_TO_EXTENSION = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

// Default max file size: 10MB (configurable)
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024;

module.exports = {
  friendlyName: 'Validate inline image',

  description: 'Validate MIME type and size of uploaded inline images',

  inputs: {
    mimeType: {
      type: 'string',
      required: true,
      description: 'MIME type of the uploaded file',
    },
    size: {
      type: 'number',
      required: true,
      description: 'File size in bytes',
    },
    maxSize: {
      type: 'number',
      defaultsTo: DEFAULT_MAX_SIZE,
      description: 'Maximum allowed file size in bytes',
    },
  },

  exits: {
    invalidMimeType: {
      description: 'The file is not a valid image type',
    },
    fileTooLarge: {
      description: 'The file exceeds the maximum allowed size',
    },
  },

  fn(inputs, exits) {
    const { mimeType, size, maxSize } = inputs;

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase())) {
      return exits.invalidMimeType({
        message: `Invalid image type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
        allowedTypes: ALLOWED_MIME_TYPES,
      });
    }

    // Validate file size
    if (size > maxSize) {
      return exits.fileTooLarge({
        message: `File size (${size} bytes) exceeds maximum allowed size (${maxSize} bytes)`,
        size,
        maxSize,
      });
    }

    // Get file extension from MIME type
    const extension = MIME_TO_EXTENSION[mimeType.toLowerCase()];

    return exits.success({
      valid: true,
      extension,
      mimeType: mimeType.toLowerCase(),
    });
  },
};
