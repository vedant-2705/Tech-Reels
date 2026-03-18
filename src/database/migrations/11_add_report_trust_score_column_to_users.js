/**
 * Migration: 011_add_report_trust_score
 *
 * Adds report_trust_score to existing users table.
 * Safe for tables with existing data - uses ADD COLUMN with a DEFAULT
 * so Postgres fills all existing rows instantly without a table rewrite.
 *
 * report_trust_score: used by Admin/Reports module to weight reports.
 * Scale: 1-10, default 5 (neutral).
 * Lower score = reporter has history of bad-faith reports.
 * Higher score = reporter is trusted (admin-granted).
 *
 * Separate migration because users table already has live data.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
    pgm.sql(`
    ALTER TABLE users
      ADD COLUMN report_trust_score SMALLINT NOT NULL DEFAULT 5;

    COMMENT ON COLUMN users.report_trust_score IS
      'Reporter credibility score 1-10. Default 5 (neutral). Used by Admin module to weight and auto-filter reports.';
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
    pgm.sql(`
    ALTER TABLE users DROP COLUMN IF EXISTS report_trust_score;
  `);
};
