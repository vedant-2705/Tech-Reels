/**
 * Migration: 014_alter_challenges_attempts
 *
 * Two fixes to the challenges_attempts table created in migration 008:
 *
 * Fix 1 - Rename column `answer` -> `submitted_answer`
 *
 * Fix 2 - Add FK constraint to challenges table
 *   Migration 008 created challenges_attempts without a FK on challenge_id
 *   because the challenges table did not exist yet (stub table pattern).
 *   Now that challenges is created in migration 013, the FK can be added.
 *   Using NOT VALID + VALIDATE CONSTRAINT pattern is safest for tables
 *   with existing data - it adds the constraint without a full table scan
 *   then validates separately. For a fresh/dev DB both can be combined.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
    pgm.sql(`
    ALTER TABLE challenges_attempts
      RENAME COLUMN answer TO submitted_answer;

    ALTER TABLE challenges_attempts
      ADD CONSTRAINT fk_attempts_challenge
      FOREIGN KEY (challenge_id)
      REFERENCES challenges (id);
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
    pgm.sql(`
    ALTER TABLE challenges_attempts
      DROP CONSTRAINT IF EXISTS fk_attempts_challenge;

    ALTER TABLE challenges_attempts
      RENAME COLUMN submitted_answer TO answer;
  `);
};
