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
    const { cardId, contentType } = inputs;
    let { content } = inputs;

    // Migrate only when saving the existing description. A new edit must not
    // be replaced by the old description or create unrelated migrated files.
    const card = await Card.findOne({ id: cardId });
    if (!card) {
      throw new Error('Card not found');
    }
    if (!card.contentMigrated && content === card.description) {
      const migration = await sails.helpers.cardContent.autoMigrateFromDescription({ cardId });
      if (migration) {
        content = migration.content;
      }
    }

    // 1. Calculate content size and hash
    const contentSize = Buffer.byteLength(content, 'utf-8');
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');

    // 2. Extract inline attachment references from content
    // eslint-disable-next-line no-use-before-define
    const inlineAttachmentRefs = extractInlineAttachmentRefs(content);
    const contentIds = [...new Set(inlineAttachmentRefs.map((ref) => ref.contentId))];
    const attachments =
      contentIds.length > 0
        ? await InlineAttachment.find({ cardId, contentId: { in: contentIds } })
        : [];
    if (attachments.length !== contentIds.length) {
      throw new Error('Unknown or cross-card inline attachment reference');
    }
    const attachmentIds = attachments.map((attachment) => attachment.id);

    // 3. Determine storage policy. Version selection and all database updates
    // happen under a per-card row lock below, so concurrent saves cannot choose
    // the same version.
    const externalThreshold = sails.config.custom.cardContentExternalThreshold;
    const inlineThreshold = sails.config.custom.cardContentInlineThreshold;
    const autoPromote = sails.config.custom.cardContentAutoPromote;
    const fileManager = sails.hooks['file-manager'].getInstance();
    let cardContent;
    let pendingContentRef = null;

    try {
      await sails.getDatastore().transaction(async (db) => {
        await sails
          .sendNativeQuery('SELECT id FROM card WHERE id = $1 FOR UPDATE', [cardId])
          .usingConnection(db);

        const currentCardContent = await CardContent.findOne({ cardId })
          .sort('version DESC')
          .usingConnection(db);
        const nextVersion = currentCardContent ? currentCardContent.version + 1 : 1;

        let storageType;
        if (
          autoPromote &&
          currentCardContent &&
          currentCardContent.storageType === CardContent.StorageTypes.INLINE &&
          contentSize > externalThreshold
        ) {
          storageType = CardContent.StorageTypes.EXTERNAL;
          sails.log.info(
            `Auto-promoting card ${cardId} content from inline to external storage (${contentSize} bytes)`,
          );
        } else if (contentSize <= inlineThreshold) {
          storageType = CardContent.StorageTypes.INLINE;
        } else {
          storageType = CardContent.StorageTypes.EXTERNAL;
        }

        if (storageType === CardContent.StorageTypes.EXTERNAL) {
          pendingContentRef = await fileManager.saveCardContent(
            cardId,
            content,
            nextVersion,
            contentHash,
          );
        }

        cardContent = await CardContent.create({
          cardId,
          contentType,
          storageType,
          contentInline: storageType === CardContent.StorageTypes.INLINE ? content : null,
          contentRef: pendingContentRef,
          contentHash,
          size: contentSize,
          version: nextVersion,
          inlineAttachmentIds: attachmentIds,
        })
          .usingConnection(db)
          .fetch();

        await Card.updateOne({ id: cardId })
          .set({
            contentMigrated: true,
            contentVersion: nextVersion,
          })
          .usingConnection(db);

        // Reset activity even after removing the final reference, atomically
        // with the content version visible from the card.
        await InlineAttachment.update({ cardId })
          .set({ isActive: false, updatedAt: new Date() })
          .usingConnection(db);
        if (attachmentIds.length > 0) {
          await InlineAttachment.update({ cardId, id: { in: attachmentIds } })
            .set({ isActive: true, updatedAt: new Date() })
            .usingConnection(db);
        }
      });
    } catch (error) {
      if (pendingContentRef) {
        await fileManager.delete(pendingContentRef);
      }
      throw error;
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
    });
  }

  return refs;
}
