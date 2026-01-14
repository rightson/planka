/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

/**
 * Migration: Large Card Content System
 *
 * This migration adds support for 10GB+ card content by:
 * 1. Creating card_content table for file-based content storage
 * 2. Creating inline_attachment table for pasted images
 * 3. Adding migration tracking to card table
 * 4. Adding source tracking to attachment table
 */

exports.up = async (knex) => {
  // 1. Create card_content table
  await knex.schema.createTable('card_content', (table) => {
    /* Columns */

    table.bigInteger('id').primary().defaultTo(knex.raw('next_id()'));
    table.bigInteger('card_id').notNullable();

    // Content storage - HYBRID APPROACH
    table.text('content_type').notNullable().defaultTo('markdown');
    table.text('storage_type').notNullable().defaultTo('inline'); // 'inline' | 'external'
    table.text('content_inline'); // For content < 1MB (stored in DB)
    table.text('content_ref'); // For content > 1MB (file path or S3 key)
    table.text('content_hash'); // SHA256 for deduplication

    // Metadata
    table.bigInteger('size').notNullable(); // Size in bytes
    table.integer('version').notNullable().defaultTo(1);
    table.text('encoding').defaultTo('utf-8');

    // Inline attachments metadata
    table.specificType('inline_attachment_ids', 'bigint[]');

    // Timestamps
    table.timestamp('created_at', true);
    table.timestamp('updated_at', true);

    /* Indexes */

    table.unique(['card_id', 'version']);
    table.index('card_id');
    table.index('content_hash');
    table.index('storage_type');

    /* Foreign Keys */

    table.foreign('card_id').references('card.id').onDelete('CASCADE');
  });

  // 2. Create inline_attachment table
  await knex.schema.createTable('inline_attachment', (table) => {
    /* Columns */

    table.bigInteger('id').primary().defaultTo(knex.raw('next_id()'));
    table.bigInteger('card_id').notNullable();
    table.text('uploaded_file_id').notNullable();

    // Distinguish from user uploads
    table.text('attachment_type').notNullable().defaultTo('inline'); // 'inline' | 'uploaded'
    table.text('source').notNullable().defaultTo('paste'); // 'paste' | 'drag-drop' | 'file-upload' | 'migration'

    // Content reference (for markdown)
    table.text('content_id').notNullable(); // Unique ID within card content
    table.text('alt_text'); // Alt text for accessibility

    // Position tracking (for ordering)
    table.double('position');

    // Usage tracking
    table.boolean('is_active').defaultTo(true); // Still referenced in content?
    table.integer('reference_count').defaultTo(1); // How many times referenced

    // Timestamps
    table.timestamp('created_at', true);
    table.timestamp('updated_at', true);

    /* Indexes */

    table.unique(['card_id', 'content_id']);
    table.index('card_id');
    table.index('uploaded_file_id');
    table.index('attachment_type');
    table.index('is_active');

    /* Foreign Keys */

    table.foreign('card_id').references('card.id').onDelete('CASCADE');
    table.foreign('uploaded_file_id').references('uploaded_file.id').onDelete('CASCADE');
  });

  // 3. Add migration tracking to card table
  await knex.schema.alterTable('card', (table) => {
    table.boolean('content_migrated').defaultTo(false);
    table.integer('content_version').defaultTo(0);
  });

  // Create index for migration queries (partial index for unmigrated cards)
  await knex.raw(`
    CREATE INDEX idx_card_content_migrated
    ON card(content_migrated)
    WHERE content_migrated = false
  `);

  // 4. Add source tracking to attachment table
  await knex.schema.alterTable('attachment', (table) => {
    table.text('source').defaultTo('upload'); // 'upload' | 'inline'
    table.bigInteger('inline_attachment_id');

    /* Indexes */

    table.index('source');

    /* Foreign Keys */

    table.foreign('inline_attachment_id').references('inline_attachment.id').onDelete('SET NULL');
  });
};

exports.down = async (knex) => {
  // Remove foreign key and columns from attachment table
  await knex.schema.alterTable('attachment', (table) => {
    table.dropForeign('inline_attachment_id');
    table.dropIndex('source');
    table.dropColumn('source');
    table.dropColumn('inline_attachment_id');
  });

  // Remove migration tracking from card table
  await knex.raw('DROP INDEX IF EXISTS idx_card_content_migrated');
  await knex.schema.alterTable('card', (table) => {
    table.dropColumn('content_migrated');
    table.dropColumn('content_version');
  });

  // Drop inline_attachment table
  await knex.schema.dropTable('inline_attachment');

  // Drop card_content table
  await knex.schema.dropTable('card_content');
};
