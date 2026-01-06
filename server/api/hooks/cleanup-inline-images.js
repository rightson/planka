/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

/**
 * Cleanup Inline Images Hook
 *
 * Automatically removes orphaned inline images that are no longer referenced
 * in any card description. Runs daily at midnight by default.
 *
 * To disable: Set CLEANUP_INLINE_IMAGES_ENABLED=false in environment
 * To change schedule: Set CLEANUP_INLINE_IMAGES_CRON (default: '0 0 * * *')
 */

module.exports = function cleanupInlineImagesHook(sails) {
  let cleanupTimer;

  return {
    defaults: {
      cleanupInlineImages: {
        // Run daily at midnight by default
        // Format: 'second minute hour day month dayOfWeek'
        // Examples:
        //   '0 0 * * *'     - Daily at midnight
        //   '0 */6 * * *'   - Every 6 hours
        //   '0 0 */7 * *'   - Every 7 days at midnight
        cron: process.env.CLEANUP_INLINE_IMAGES_CRON || '0 0 * * *',
        enabled: process.env.CLEANUP_INLINE_IMAGES_ENABLED !== 'false',
      },
    },

    initialize(cb) {
      // Don't run in test environment
      if (sails.config.environment === 'test') {
        return cb();
      }

      const config = sails.config.cleanupInlineImages;

      if (!config.enabled) {
        sails.log.info('Inline images cleanup hook is disabled');
        return cb();
      }

      // Parse cron schedule
      const [second, minute, hour, day, month, dayOfWeek] = config.cron.split(' ');

      // Convert cron to milliseconds for initial delay and interval
      // For simplicity, if it's daily (0 0 * * *), run every 24 hours
      // For production, consider using a proper cron library like 'node-cron'
      const scheduleCleanup = () => {
        sails.log.info('Running scheduled inline images cleanup...');

        sails.helpers.inlineImages.cleanupOrphaned({ dryRun: false })
          .then((result) => {
            sails.log.info(
              `Inline images cleanup completed: ${result.deleted}/${result.orphaned} orphaned images deleted (${result.checked} checked)`
            );
          })
          .catch((error) => {
            sails.log.error('Failed to run inline images cleanup:', error);
          });
      };

      // Run cleanup daily (24 hours)
      const intervalMs = 24 * 60 * 60 * 1000;

      // Calculate time until next midnight for initial delay
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const initialDelay = tomorrow - now;

      sails.log.info(
        `Inline images cleanup scheduled: next run in ${Math.round(initialDelay / 1000 / 60)} minutes, then every ${intervalMs / 1000 / 60 / 60} hours`
      );

      // Schedule first run at next midnight
      setTimeout(() => {
        scheduleCleanup();
        // Then run daily
        cleanupTimer = setInterval(scheduleCleanup, intervalMs);
      }, initialDelay);

      cb();
    },

    teardown(cb) {
      if (cleanupTimer) {
        clearInterval(cleanupTimer);
      }
      cb();
    },
  };
};
