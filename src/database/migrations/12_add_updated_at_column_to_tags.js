/**
 * Migration: 12_add_tags_updated_at
 *
 * Adds updated_at to the tags table.
 * Safe for existing data - ADD COLUMN with DEFAULT fills all rows instantly.
 *
 * Separate migration because tags table already has live data.
 * updated_at is needed for the PATCH /tags/:id response shape.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
    pgm.sql(`
    ALTER TABLE tags
      ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

    COMMENT ON COLUMN tags.updated_at IS
      'Last time this tag was renamed or recategorised by an admin.';
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
    pgm.sql(`
    ALTER TABLE tags DROP COLUMN IF EXISTS updated_at;
  `);
};
