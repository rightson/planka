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
    dryRun: { type: 'boolean', defaultsTo: false },
  },

  async fn(inputs, exits) {
    // Images can belong to unsaved editor sessions; missing saved references
    // alone never proves that they are safe to remove.
    if (!inputs.dryRun) {
      throw new Error(
        'Destructive inline-image cleanup requires race-safe reference tracking; use dryRun',
      );
    }
    const images = await InlineImage.find();
    const cards = await Card.find();
    const descriptions = cards.map((card) => card.description || '').join('\n');
    const orphaned = images.filter(
      ({ markdownPath, filename }) =>
        !(markdownPath && descriptions.includes(markdownPath)) &&
        !(filename && descriptions.includes(filename)),
    );
    orphaned.forEach((image) => sails.log.info(`Potential orphan: ${image.filename}`));
    return exits.success({
      checked: images.length,
      orphaned: orphaned.length,
      deleted: 0,
      dryRun: true,
    });
  },
};
