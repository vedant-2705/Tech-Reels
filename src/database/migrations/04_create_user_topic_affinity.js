/**
 * Migration: 004_create_user_topic_affinity
 *
 * Stores each user's affinity score per tag (topic).
 * Seeded at registration: score = 1.0 per selected topic.
 * Continuously updated by the Affinity Worker as the user watches reels.
 * Composite PK (user_id, tag_id) - no separate id column needed.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
    pgm.sql(`
    CREATE TABLE user_topic_affinity (
      user_id     UUID          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      tag_id      UUID          NOT NULL REFERENCES tags  (id) ON DELETE CASCADE,
      score       NUMERIC(5,2)  NOT NULL DEFAULT 0.0,
      updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),

      PRIMARY KEY (user_id, tag_id)
    );

    CREATE INDEX user_topic_affinity_user_id_idx ON user_topic_affinity (user_id);
    CREATE INDEX user_topic_affinity_tag_id_idx  ON user_topic_affinity (tag_id);
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
    pgm.sql(`DROP TABLE IF EXISTS user_topic_affinity CASCADE;`);
};
