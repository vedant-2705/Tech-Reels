/**
 * Migration: 003_create_tags
 *
 * Tag catalogue. No soft delete - tags are managed by admins only.
 * Auth module queries this table during registration to validate
 * topic UUIDs supplied by the user (validateTagIds).
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
    pgm.sql(`
    CREATE TABLE tags (
      id          UUID          PRIMARY KEY,
      name        VARCHAR(50)   UNIQUE NOT NULL,
      category    VARCHAR(30)   NOT NULL,
      created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
    );

    CREATE INDEX tags_category_idx ON tags (category);
    CREATE INDEX tags_name_idx ON tags (name);
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
    pgm.sql(`DROP TABLE IF EXISTS tags CASCADE;`);
};
