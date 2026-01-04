/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

exports.up = async (knex) => {
  await knex.schema.createTable('inline_image', (table) => {
    /* Columns */

    table.bigInteger('id').primary().defaultTo(knex.raw('next_id()'));

    table.bigInteger('card_id').notNullable();
    table.bigInteger('uploaded_file_id').notNullable();

    table.text('filename').notNullable();
    table.text('markdown_path').notNullable();

    table.timestamp('created_at', true);
    table.timestamp('updated_at', true);

    /* Indexes */

    table.index('card_id');
    table.index('uploaded_file_id');
    table.index('markdown_path');
  });
};

exports.down = (knex) =>
  knex.schema.dropTable('inline_image');
