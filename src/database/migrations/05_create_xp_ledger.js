/**
 * Migration: 005_create_xp_ledger
 *
 * Append-only ledger of every XP award and deduction event.
 * Never updated or deleted - permanent audit trail.
 * users.total_xp is the denormalised running total for fast reads.
 *
 * delta: positive = earned, negative = admin deduction
 * reference_id: points to challenge_id or reel_id depending on source
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
    pgm.sql(`
    CREATE TYPE xp_source AS ENUM (
      'challenge_correct',
      'reel_watch',
      'streak_bonus',
      'path_completed',
      'admin_grant'
    );

    CREATE TABLE xp_ledger (
      id            UUID        PRIMARY KEY,
      user_id       UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      delta         INTEGER     NOT NULL,
      source        xp_source   NOT NULL,
      reference_id  UUID        NULL,
      note          TEXT        NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX xp_ledger_user_created_idx
      ON xp_ledger (user_id, created_at DESC);

    CREATE INDEX xp_ledger_source_idx
      ON xp_ledger (source, created_at DESC);

    CREATE INDEX xp_ledger_reference_idx
      ON xp_ledger (reference_id)
      WHERE reference_id IS NOT NULL;
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
    pgm.sql(`
    DROP TABLE IF EXISTS xp_ledger CASCADE;
    DROP TYPE IF EXISTS xp_source;
  `);
};
