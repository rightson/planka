/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

module.exports = {
  inputs: {
    cardId: {
      type: 'string',
      required: true,
    },
    version: {
      type: 'number',
      description: 'Specific version to retrieve (defaults to latest)',
    },
  },

  async fn(inputs) {
    const { cardId, version } = inputs;

    const card = await Card.findOne({ id: cardId });

    if (!card) {
      throw new Error('Card not found');
    }

    let content = null;
    let inlineAttachments = [];
    let cardContent = null;

    if (card.contentMigrated) {
      // NEW SYSTEM: Load from file storage
      const query = { cardId };

      if (version) {
        query.version = version;
      } else {
        query.version = card.contentVersion;
      }

      cardContent = await CardContent.findOne(query);

      if (cardContent) {
        // HYBRID STORAGE: Load from inline or external based on storage type
        if (cardContent.storageType === CardContent.StorageTypes.INLINE) {
          // Load from database
          content = cardContent.contentInline;
        } else {
          // Load from file storage
          const fileManager = sails.hooks.fileManager.getInstance();
          content = await fileManager.readCardContent(cardContent.contentRef);
        }

        // Load inline attachments
        if (cardContent.inlineAttachmentIds && cardContent.inlineAttachmentIds.length > 0) {
          inlineAttachments = await InlineAttachment.find({
            id: { in: cardContent.inlineAttachmentIds },
            isActive: true,
          }).populate('uploadedFileId');
        }
      }
    } else {
      // OLD SYSTEM: Use description field
      content = card.description || '';
    }

    return {
      content,
      contentType: cardContent ? cardContent.contentType : 'markdown',
      version: cardContent ? cardContent.version : 0,
      size: cardContent ? cardContent.size : (content ? Buffer.byteLength(content, 'utf-8') : 0),
      inlineAttachments,
      contentMigrated: card.contentMigrated,
    };
  },
};
