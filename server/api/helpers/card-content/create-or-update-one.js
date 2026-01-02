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

    // 1. Get current version
    const currentCardContent = await CardContent.findOne({
      cardId,
    }).sort('version DESC');

    const nextVersion = currentCardContent ? currentCardContent.version + 1 : 1;

    // 2. Extract inline attachment references from content
    const inlineAttachmentRefs = extractInlineAttachmentRefs(content);

    // 3. Calculate content hash
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');

    // 4. Save content to file storage
    const fileManager = sails.hooks.fileManager.getInstance();
    const contentRef = await fileManager.saveCardContent(cardId, content, nextVersion);

    // 5. Create CardContent record
    const cardContent = await CardContent.create({
      cardId,
      contentType,
      contentRef,
      contentHash,
      size: Buffer.byteLength(content, 'utf-8'),
      version: nextVersion,
      inlineAttachmentIds: inlineAttachmentRefs.map((ref) => ref.id),
    }).fetch();

    // 6. Update inline attachment reference counts
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

    // 7. Mark card as migrated
    await Card.updateOne({ id: cardId }).set({
      contentMigrated: true,
      contentVersion: nextVersion,
    });

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
