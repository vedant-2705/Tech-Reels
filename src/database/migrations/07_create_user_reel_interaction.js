/**
 * Migration: 007_create_user_reel_interactions
 *
 * Append-only interaction log — every watch, like, save, share event.
 * Used for: reels watched count, affinity scoring, feed personalisation.
 * Never updated or deleted.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
    pgm.sql(`
        CREATE TYPE intr_type AS ENUM ('watch', 'share');

    CREATE TABLE user_reel_interaction (
      id               UUID               PRIMARY KEY,
      user_id          UUID               NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      reel_id          UUID               NOT NULL,
      interaction_type intr_type          NOT NULL,
      watch_duration_secs  SMALLINT       NULL,
      completion_pct       SMALLINT       NULL,
      share_platform       VARCHAR(50)    NULL,
      created_at           TIMESTAMPTZ    NOT NULL DEFAULT now()
    );

    CREATE INDEX uri_user_id_type_idx
      ON user_reel_interaction (user_id, interaction_type);

    CREATE INDEX uri_user_reel_idx
      ON user_reel_interaction (user_id, reel_id);
 
    CREATE INDEX uri_user_id_created_at_idx
      ON user_reel_interaction (user_id, created_at DESC);
 
    CREATE INDEX uri_reel_interaction_type_idx
      ON user_reel_interaction (reel_id, interaction_type);
 
    CREATE INDEX uri_reel_completion_idx
      ON user_reel_interaction (reel_id, completion_pct)
      WHERE interaction_type = 'watch';
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
    pgm.sql(`
        DROP TABLE IF EXISTS user_reel_interaction CASCADE;
        DROP TYPE IF EXISTS intr_type;    
    `);
};
