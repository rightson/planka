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
  },

  async fn(inputs) {
    const { cardId } = inputs;

    // Check if card needs migration
    const card = await Card.findOne({ id: cardId });

    if (!card) {
      throw new Error('Card not found');
    }

    // Skip if already migrated or no description
    if (card.contentMigrated || !card.description) {
      return null;
    }

    sails.log.info(`Auto-migrating card ${cardId} from description to new content system`);

    // Extract base64 images from description
    const { migratedContent, inlineAttachments } = await extractBase64Images(
      card.description,
      cardId,
    );

    // Save inline attachments
    const fileManager = sails.hooks.fileManager.getInstance();
    const savedAttachments = [];

    for (const attachment of inlineAttachments) {
      try {
        // Generate content ID for inline:// URLs
        const contentId = crypto.randomBytes(16).toString('hex');
        const buffer = Buffer.from(attachment.data, 'base64');
        const filename = `pasted-image-${contentId}.${attachment.extension}`;

        // Create UploadedFile record first
        const uploadedFile = await UploadedFile.create({
          type: 'inlineAttachment',
          mimeType: attachment.mimeType,
          size: buffer.length,
          referencesTotal: 1,
        }).fetch();

        // Save file to storage using uploadedFile.id
        await fileManager.saveInlineAttachment(
          uploadedFile.id,
          filename,
          buffer,
          attachment.mimeType,
        );

        // Create InlineAttachment record
        const inlineAttachment = await InlineAttachment.create({
          cardId,
          uploadedFileId: uploadedFile.id,
          contentId,
          source: InlineAttachment.Sources.MIGRATION,
          position: savedAttachments.length,
          isActive: true,
        }).fetch();

        savedAttachments.push({
          placeholder: attachment.placeholder,
          contentId,
          id: inlineAttachment.id,
        });
      } catch (error) {
        sails.log.error(`Failed to save inline attachment for card ${cardId}:`, error);
        // Continue with other attachments
      }
    }

    // Replace placeholders with inline:// URLs
    let finalContent = migratedContent;
    for (const attachment of savedAttachments) {
      finalContent = finalContent.replace(
        new RegExp(attachment.placeholder, 'g'),
        `inline://${attachment.contentId}`,
      );
    }

    return {
      content: finalContent,
      inlineAttachmentCount: savedAttachments.length,
    };
  },
};

/**
 * Extract base64 images from markdown content
 * @param {string} content - Markdown content with base64 images
 * @param {string} cardId - Card ID for logging
 * @returns {Object} - { migratedContent, inlineAttachments }
 */
async function extractBase64Images(content, cardId) {
  const base64ImageRegex = /!\[([^\]]*)\]\(data:([^;]+);base64,([^)]+)\)/g;
  const inlineAttachments = [];
  let match;
  let migratedContent = content;
  let placeholderIndex = 0;

  // eslint-disable-next-line no-cond-assign
  while ((match = base64ImageRegex.exec(content)) !== null) {
    const [fullMatch, altText, mimeType, base64Data] = match;
    const placeholder = `__INLINE_ATTACHMENT_${placeholderIndex}__`;

    // Determine file extension from MIME type
    const extension = mimeType.split('/')[1] || 'png';

    inlineAttachments.push({
      altText: altText || 'Pasted image',
      mimeType,
      data: base64Data,
      extension,
      placeholder,
    });

    // Replace base64 with placeholder temporarily
    migratedContent = migratedContent.replace(fullMatch, `![${altText}](${placeholder})`);
    placeholderIndex++;
  }

  if (inlineAttachments.length > 0) {
    sails.log.info(
      `Extracted ${inlineAttachments.length} base64 images from card ${cardId} description`,
    );
  }

  return {
    migratedContent,
    inlineAttachments,
  };
}
