/**
 * Migration: 008_create_challenge_attempts
 *
 * Append-only record of every challenge attempt.
 * Used for: accuracy_rate, challenges_attempted, challenges_correct stats.
 * Never updated or deleted.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
    pgm.sql(`
    CREATE TABLE challenges_attempts (
      id              UUID        PRIMARY KEY,
      user_id         UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      challenge_id    UUID        NOT NULL,
      answer          TEXT        NOT NULL,
      is_correct      BOOLEAN     NOT NULL,
      attempt_number  SMALLINT    NOT NULL,
      xp_awarded      SMALLINT    NOT NULL DEFAULT 0,
      token_awarded   SMALLINT    NOT NULL DEFAULT 0,
      attempted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX ca_user_challenge_idx
      ON challenges_attempts (user_id, challenge_id);
 
    CREATE INDEX ca_user_id_idx
      ON challenges_attempts (user_id, attempted_at DESC);
 
    CREATE INDEX ca_challenge_id_idx
      ON challenges_attempts (challenge_id);
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
    pgm.sql(`DROP TABLE IF EXISTS challenges_attempts CASCADE;`);
};
