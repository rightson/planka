/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

exports.up = async (knex) => {
  // Create card_content table for storing large content in file storage
  await knex.schema.createTable('card_content', (table) => {
    /* Columns */

    table.bigInteger('id').primary().defaultTo(knex.raw('next_id()'));

    table.bigInteger('card_id').notNullable();

    table.text('content_type').notNullable().defaultTo('markdown');
    table.text('content_ref').notNullable(); // File path or S3 key
    table.text('content_hash'); // SHA256 for deduplication

    table.bigInteger('size').notNullable(); // Size in bytes
    table.integer('version').notNullable().defaultTo(1); // Version number
    table.text('encoding').defaultTo('utf-8');

    table.specificType('inline_attachment_ids', 'bigint[]'); // Array of inline attachment IDs

    table.timestamp('created_at', true);
    table.timestamp('updated_at', true);

    /* Indexes */

    table.index('card_id');
    table.index('content_hash');
    table.unique(['card_id', 'version']);

    /* Foreign keys */

    table.foreign('card_id').references('card.id').onDelete('CASCADE');
  });

  // Create inline_attachment table for pasted images
  await knex.schema.createTable('inline_attachment', (table) => {
    /* Columns */

    table.bigInteger('id').primary().defaultTo(knex.raw('next_id()'));

    table.bigInteger('card_id').notNullable();
    table.text('uploaded_file_id').notNullable();

    table.text('attachment_type').notNullable().defaultTo('inline'); // 'inline' | 'uploaded'
    table.text('source').notNullable().defaultTo('paste'); // 'paste' | 'drag-drop' | 'migration'

    table.text('content_id').notNullable(); // Unique ID within card (e.g., img_abc123)
    table.text('alt_text'); // Alt text for accessibility

    table.specificType('position', 'double precision'); // Position tracking

    table.boolean('is_active').defaultTo(true); // Still referenced in content?
    table.integer('reference_count').defaultTo(1); // How many times referenced

    table.timestamp('created_at', true);
    table.timestamp('updated_at', true);

    /* Indexes */

    table.index('card_id');
    table.index('uploaded_file_id');
    table.index('attachment_type');
    table.unique(['card_id', 'content_id']);

    /* Foreign keys */

    table.foreign('card_id').references('card.id').onDelete('CASCADE');
    table.foreign('uploaded_file_id').references('uploaded_file.id').onDelete('CASCADE');
  });

  // Add migration tracking columns to card table
  await knex.schema.alterTable('card', (table) => {
    table.boolean('content_migrated').defaultTo(false);
    table.integer('content_version').defaultTo(0);
  });

  // Add index for migration queries
  await knex.raw(`
    CREATE INDEX idx_card_content_migrated ON card(content_migrated) WHERE content_migrated = false;
  `);

  // Add source tracking to existing attachment table
  await knex.schema.alterTable('attachment', (table) => {
    table.text('source').defaultTo('upload'); // 'upload' | 'inline'
    table.bigInteger('inline_attachment_id');

    table.index('source');
    table.foreign('inline_attachment_id').references('inline_attachment.id').onDelete('SET NULL');
  });

  // Add hash column to uploaded_file for deduplication
  await knex.schema.alterTable('uploaded_file', (table) => {
    table.text('hash'); // SHA256 hash for deduplication
    table.index('hash');
  });
};

exports.down = async (knex) => {
  // Remove columns from uploaded_file
  await knex.schema.alterTable('uploaded_file', (table) => {
    table.dropIndex('hash');
    table.dropColumn('hash');
  });

  // Remove columns from attachment
  await knex.schema.alterTable('attachment', (table) => {
    table.dropForeign('inline_attachment_id');
    table.dropIndex('source');
    table.dropColumn('inline_attachment_id');
    table.dropColumn('source');
  });

  // Remove index from card
  await knex.raw('DROP INDEX IF EXISTS idx_card_content_migrated;');

  // Remove columns from card
  await knex.schema.alterTable('card', (table) => {
    table.dropColumn('content_migrated');
    table.dropColumn('content_version');
  });

  // Drop tables
  await knex.schema.dropTable('inline_attachment');
  await knex.schema.dropTable('card_content');
};
