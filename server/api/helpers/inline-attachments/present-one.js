/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

module.exports = {
  inputs: {
    inlineAttachment: {
      type: 'ref',
      required: true,
    },
    data: {
      type: 'ref',
    },
  },

  fn(inputs) {
    const { inlineAttachment, data } = inputs;
    const fileManager = sails.hooks['file-manager'].getInstance();

    const result = {
      id: inlineAttachment.id,
      cardId: inlineAttachment.cardId,
      contentId: inlineAttachment.contentId,
      attachmentType: inlineAttachment.attachmentType,
      source: inlineAttachment.source,
      altText: inlineAttachment.altText,
      position: inlineAttachment.position,
      isActive: inlineAttachment.isActive,
      referenceCount: inlineAttachment.referenceCount,
      createdAt: inlineAttachment.createdAt,
      updatedAt: inlineAttachment.updatedAt,
    };

    if (data) {
      const dirPathSegment = `private/inline-attachments/${data.uploadedFileId}`;

      result.url = fileManager.buildUrl(`${dirPathSegment}/${data.filename}`);
      result.mimeType = data.mimeType;
      result.size = data.size;
      result.encoding = data.encoding;

      if (data.image) {
        const thumbnailsPathSegment = `${dirPathSegment}/thumbnails`;
        const { thumbnailsExtension } = data.image;

        result.image = {
          width: data.image.width,
          height: data.image.height,
          thumbnailUrl: fileManager.buildUrl(
            `${thumbnailsPathSegment}/cover-360.${thumbnailsExtension}`,
          ),
          thumbnailUrl720: fileManager.buildUrl(
            `${thumbnailsPathSegment}/outside-720.${thumbnailsExtension}`,
          ),
        };
      }
    }

    return result;
  },
};
