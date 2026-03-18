/**
 * Migration: 010_create_reels
 *
 * Reels table and all dependent junction tables.
 * Also creates: reel_tags, liked_reels, saved_reels.
 *
 * status values match schema exactly:
 *   uploading -> processing -> active | failed | needs_review | disabled
 *
 * difficulty uses the diff_lvl enum shared with other tables.
 * liked_reels and saved_reels are dedicated junction tables for efficient
 * bidirectional lookups - separate from user_reel_interaction (watch/share).
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
    pgm.sql(`
    CREATE TYPE reel_status AS ENUM (
      'uploading',
      'processing',
      'active',
      'needs_review',
      'disabled',
      'failed'
    );

    CREATE TYPE difficulty_level AS ENUM (
      'beginner',
      'intermediate',
      'advanced'
    );

    CREATE TABLE reels (
      id               UUID                PRIMARY KEY,
      creator_id       UUID                NOT NULL REFERENCES users (id),
      title            VARCHAR(150)        NOT NULL,
      description      TEXT                NULL,
      hls_path         TEXT                NULL,
      thumbnail_key    TEXT                NULL,
      duration_seconds SMALLINT            NULL,
      status           reel_status         NOT NULL DEFAULT 'uploading',
      difficulty       difficulty_level    NOT NULL,

      view_count       INTEGER             NOT NULL DEFAULT 0,
      like_count       INTEGER             NOT NULL DEFAULT 0,
      save_count       INTEGER             NOT NULL DEFAULT 0,
      share_count      INTEGER             NOT NULL DEFAULT 0,
      is_premium       BOOLEAN             NOT NULL DEFAULT false,

      created_at       TIMESTAMPTZ         NOT NULL DEFAULT now(),
      updated_at       TIMESTAMPTZ         NOT NULL DEFAULT now(),
      deleted_at       TIMESTAMPTZ         NULL
    );

    CREATE INDEX reels_creator_id_idx
      ON reels (creator_id)
      WHERE deleted_at IS NULL;

    CREATE INDEX reels_status_idx
      ON reels (status)
      WHERE deleted_at IS NULL;

    CREATE INDEX reels_difficulty_status_idx
      ON reels (difficulty, status)
      WHERE deleted_at IS NULL;

    CREATE INDEX reels_created_idx
      ON reels (created_at DESC)
      WHERE status = 'active';

    CREATE INDEX reels_feed_idx
      ON reels (status, difficulty, created_at DESC)
      WHERE deleted_at IS NULL AND status = 'active';


    -- reel_tags: junction between reels and tags
    CREATE TABLE reel_tags (
      reel_id UUID NOT NULL REFERENCES reels (id) ON DELETE CASCADE,
      tag_id  UUID NOT NULL REFERENCES tags  (id) ON DELETE CASCADE,
      PRIMARY KEY (reel_id, tag_id)
    );

    CREATE INDEX reel_tags_tag_id_idx  ON reel_tags (tag_id);
    CREATE INDEX reel_tags_reel_id_idx ON reel_tags (reel_id);


    -- liked_reels: dedicated like junction for bidirectional lookups
    CREATE TABLE liked_reels (
      user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      reel_id    UUID        NOT NULL REFERENCES reels (id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

      PRIMARY KEY (user_id, reel_id)
    );

    CREATE INDEX liked_reels_user_id_idx ON liked_reels (user_id);
    CREATE INDEX liked_reels_reel_id_idx ON liked_reels (reel_id);


    -- saved_reels: dedicated save junction for bidirectional lookups
    CREATE TABLE saved_reels (
      user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      reel_id    UUID        NOT NULL REFERENCES reels (id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      
      PRIMARY KEY (user_id, reel_id)
    );

    CREATE INDEX saved_reels_user_id_idx ON saved_reels (user_id);
    CREATE INDEX saved_reels_reel_id_idx ON saved_reels (reel_id);
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
    pgm.sql(`
    DROP TABLE IF EXISTS saved_reels   CASCADE;
    DROP TABLE IF EXISTS liked_reels   CASCADE;
    DROP TABLE IF EXISTS reel_tags     CASCADE;
    DROP TABLE IF EXISTS reels         CASCADE;
    DROP TYPE IF EXISTS difficulty_level;
    DROP TYPE IF EXISTS reel_status;
  `);
};
