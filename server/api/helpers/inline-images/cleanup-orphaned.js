/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

/**
 * Cleanup orphaned inline images
 * Removes inline images that are no longer referenced in any card description
 */
module.exports = {
  inputs: {
    dryRun: {
      type: 'boolean',
      defaultsTo: false,
      description: 'If true, only report what would be deleted without actually deleting',
    },
  },

  async fn(inputs, exits) {
    const fileManager = sails.hooks['file-manager'].getInstance();

    try {
      // Get all inline images
      const allInlineImages = await InlineImage.qm.getAll();

      if (allInlineImages.length === 0) {
        sails.log.info('No inline images found to check for cleanup');
        return exits.success({
          checked: 0,
          orphaned: 0,
          deleted: 0,
        });
      }

      sails.log.info(`Checking ${allInlineImages.length} inline images for orphaned entries`);

      // Get all cards with descriptions
      const allCards = await Card.qm.getAll();
      const allDescriptions = allCards
        .map(card => card.description)
        .filter(desc => desc !== null);

      // Combine all descriptions into one searchable text
      const allDescriptionsText = allDescriptions.join('\n');

      const orphanedImages = [];

      // Check each inline image to see if it's referenced
      for (const inlineImage of allInlineImages) {
        const { markdownPath, filename, uploadedFileId } = inlineImage;

        // Check if the markdown path appears in any description
        const isReferenced = allDescriptionsText.includes(markdownPath) ||
                            allDescriptionsText.includes(filename);

        if (!isReferenced) {
          orphanedImages.push(inlineImage);
        }
      }

      if (orphanedImages.length === 0) {
        sails.log.info('No orphaned inline images found');
        return exits.success({
          checked: allInlineImages.length,
          orphaned: 0,
          deleted: 0,
        });
      }

      sails.log.info(`Found ${orphanedImages.length} orphaned inline images`);

      if (inputs.dryRun) {
        sails.log.info('Dry run mode - would delete:');
        orphanedImages.forEach(img => {
          sails.log.info(`  - ${img.filename} (${img.markdownPath})`);
        });

        return exits.success({
          checked: allInlineImages.length,
          orphaned: orphanedImages.length,
          deleted: 0,
          dryRun: true,
        });
      }

      // Delete orphaned images
      let deletedCount = 0;

      for (const orphanedImage of orphanedImages) {
        try {
          const { filename, uploadedFileId, id: inlineImageId } = orphanedImage;

          // Delete the file
          const filePathSegment = `${sails.config.custom.inlineImagesPathSegment}/${filename}`;

          try {
            await fileManager.delete(filePathSegment);
            sails.log.info(`Deleted orphaned file: ${filePathSegment}`);
          } catch (fileError) {
            sails.log.warn(`Failed to delete file ${filePathSegment}:`, fileError.message);
            // Continue with record cleanup even if file deletion fails
          }

          // Delete the InlineImage record
          await InlineImage.qm.destroy({ id: inlineImageId });

          // Decrement or delete UploadedFile record
          const uploadedFile = await UploadedFile.qm.getOne({ id: uploadedFileId });

          if (uploadedFile) {
            if (uploadedFile.referencesTotal > 1) {
              await UploadedFile.qm.update(
                { id: uploadedFileId },
                { referencesTotal: uploadedFile.referencesTotal - 1 }
              );
            } else {
              await UploadedFile.qm.destroy({ id: uploadedFileId });
            }
          }

          deletedCount++;
        } catch (error) {
          sails.log.error(`Failed to cleanup orphaned image ${orphanedImage.filename}:`, error);
        }
      }

      sails.log.info(`Cleanup completed: ${deletedCount}/${orphanedImages.length} orphaned images deleted`);

      return exits.success({
        checked: allInlineImages.length,
        orphaned: orphanedImages.length,
        deleted: deletedCount,
      });
    } catch (error) {
      sails.log.error('Error during inline images cleanup:', error);
      throw error;
    }
  },
};
