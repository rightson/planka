/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

const crypto = require('crypto');

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
    contentType: {
      type: 'string',
      defaultsTo: 'markdown',
    },
  },

  async fn(inputs) {
    const { cardId, content, contentType } = inputs;

    // 1. Calculate content size and hash
    const contentSize = Buffer.byteLength(content, 'utf-8');
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');

    // 2. Extract inline attachment references from content
    const inlineAttachmentRefs = extractInlineAttachmentRefs(content);

    // 3. Get current version
    const currentCardContent = await CardContent.findOne({
      cardId,
    }).sort('version DESC');

    const nextVersion = currentCardContent ? currentCardContent.version + 1 : 1;

    // 4. Determine storage type based on size
    const externalThreshold = sails.config.custom.cardContentExternalThreshold;
    const inlineThreshold = sails.config.custom.cardContentInlineThreshold;
    const autoPromote = sails.config.custom.cardContentAutoPromote;

    let storageType;
    let contentInline = null;
    let contentRef = null;

    // Check if auto-promotion is needed
    if (
      autoPromote &&
      currentCardContent &&
      currentCardContent.storageType === CardContent.StorageTypes.INLINE &&
      contentSize > externalThreshold
    ) {
      // ✅ Auto-promote from inline to external storage
      storageType = CardContent.StorageTypes.EXTERNAL;
      sails.log.info(
        `Auto-promoting card ${cardId} content from inline to external storage (${contentSize} bytes)`,
      );
    } else if (contentSize <= inlineThreshold) {
      // Store in database
      storageType = CardContent.StorageTypes.INLINE;
      contentInline = content;
    } else {
      // Store in file system
      storageType = CardContent.StorageTypes.EXTERNAL;
    }

    // 5. Save external content to file storage if needed
    const fileManager = sails.hooks.fileManager.getInstance();
    if (storageType === CardContent.StorageTypes.EXTERNAL) {
      contentRef = await fileManager.saveCardContent(cardId, content, nextVersion);
    }

    // 6. Create CardContent record with ACID transaction for inline storage
    let cardContent;

    if (storageType === CardContent.StorageTypes.INLINE) {
      // Use transaction for ACID guarantees with inline storage
      await sails.getDatastore().transaction(async (db) => {
        // Create CardContent record
        cardContent = await CardContent.create({
          cardId,
          contentType,
          storageType,
          contentInline,
          contentRef: null,
          contentHash,
          size: contentSize,
          version: nextVersion,
          inlineAttachmentIds: inlineAttachmentRefs.map((ref) => ref.id),
        })
          .usingConnection(db)
          .fetch();

        // Update card version atomically
        await Card.updateOne({ id: cardId })
          .set({
            contentMigrated: true,
            contentVersion: nextVersion,
          })
          .usingConnection(db);
      });
    } else {
      // External storage - file already saved
      cardContent = await CardContent.create({
        cardId,
        contentType,
        storageType,
        contentInline: null,
        contentRef,
        contentHash,
        size: contentSize,
        version: nextVersion,
        inlineAttachmentIds: inlineAttachmentRefs.map((ref) => ref.id),
      }).fetch();

      // Update card version
      await Card.updateOne({ id: cardId }).set({
        contentMigrated: true,
        contentVersion: nextVersion,
      });
    }

    // 7. Update inline attachment reference counts
    if (inlineAttachmentRefs.length > 0) {
      await InlineAttachment.update({
        cardId,
        contentId: { in: inlineAttachmentRefs.map((r) => r.contentId) },
      }).set({ isActive: true, updatedAt: new Date() });

      // Mark unused inline attachments as inactive
      await InlineAttachment.update({
        cardId,
        contentId: { nin: inlineAttachmentRefs.map((r) => r.contentId) },
      }).set({ isActive: false, updatedAt: new Date() });
    }

    return cardContent;
  },
};

/**
 * Extract inline attachment references from content
 * Looks for inline:// URLs in markdown
 * @param {string} content - Markdown content
 * @returns {Array<{contentId: string, id: string}>} - Array of inline attachment references
 */
function extractInlineAttachmentRefs(content) {
  const regex = /inline:\/\/([\w-]+)/g;
  const refs = [];
  let match;

  // eslint-disable-next-line no-cond-assign
  while ((match = regex.exec(content)) !== null) {
    refs.push({
      contentId: match[1],
      id: match[1], // This will be resolved to actual ID in the database
    });
  }

  return refs;
}
