/**
 * Migration: 013_create_challenges
 *
 * Creates the challenges table for micro-challenges attached to reels.
 *
 * Column notes:
 *   type          - challenge_type enum: mcq | code_fill only.
 *                   true_false and output_prediction are NOT included -
 *                   no evaluator or service logic exists for them yet.
 *   "order"       - quoted because ORDER is a SQL reserved word. 1-indexed.
 *   case_sensitive - used by code_fill evaluator. Default false = case-insensitive.
 *   difficulty    - reuses difficulty_level enum created in migration 010.
 *   correct_answer - TEXT for both MCQ (stored as '0','1','2','3') and code_fill.
 *                    Never exposed in GET /reels/:id/challenges response.
 *
 * Soft delete: challenges are user-facing content - deleted_at not hard delete.
 *
 * FK to reels added immediately (reels table exists from migration 010).
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
    pgm.sql(`
    CREATE TYPE challenge_type AS ENUM ('mcq', 'code_fill', 'true_false', 'output_prediction');

    CREATE TABLE challenges (
      id              UUID              PRIMARY KEY,
      reel_id         UUID              NOT NULL REFERENCES reels (id) ON DELETE CASCADE,
      type            challenge_type    NOT NULL,
      question        TEXT              NOT NULL,
      options         JSONB             NULL,
      correct_answer  TEXT              NOT NULL,
      explanation     TEXT              NOT NULL,
      difficulty      difficulty_level  NOT NULL,
      xp_reward       SMALLINT          NOT NULL DEFAULT 10,
      token_reward    SMALLINT          NOT NULL DEFAULT 2,
      case_sensitive  BOOLEAN           NOT NULL DEFAULT false,
      "order"         SMALLINT          NOT NULL DEFAULT 0,
      max_attempts    SMALLINT          NOT NULL DEFAULT 3,
      created_at      TIMESTAMPTZ       NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ       NOT NULL DEFAULT now(),
      deleted_at      TIMESTAMPTZ       NULL
    );

    CREATE INDEX challenges_reel_id_idx
      ON challenges (reel_id)
      WHERE deleted_at IS NULL;
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
    pgm.sql(`
    DROP TABLE IF EXISTS challenges CASCADE;
    DROP TYPE IF EXISTS challenge_type;
  `);
};
