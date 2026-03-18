/**
 * Migration: 006_create_badges
 *
 * Badge catalogue (admin-managed) and user_badges junction table
 * recording when each user earned each badge.
 * Append-only — badges are never revoked once earned.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
    pgm.sql(`
    CREATE TABLE badges (
      id          UUID          PRIMARY KEY,
      code        VARCHAR(100)  UNIQUE NOT NULL,
      name        VARCHAR(100)  NOT NULL,
      description TEXT          NOT NULL,
      icon_url    TEXT          NOT NULL,
      criteria    JSONB         NOT NULL,
      is_active   BOOLEAN       NOT NULL DEFAULT true,
      created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
    );

    CREATE INDEX badges_code_idx      ON badges (code);
    CREATE INDEX badges_is_active_idx ON badges (is_active);

    CREATE TABLE user_badges (
      id         UUID        PRIMARY KEY,
      user_id    UUID        NOT NULL REFERENCES users  (id) ON DELETE CASCADE,
      badge_id   UUID        NOT NULL REFERENCES badges (id) ON DELETE CASCADE,
      earned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

      CONSTRAINT user_badges_unique UNIQUE (user_id, badge_id)
    );

    CREATE INDEX user_badges_user_id_idx     ON user_badges (user_id);
    CREATE INDEX user_badges_badge_id_idx    ON user_badges (badge_id);
    CREATE INDEX user_badges_earned_at_idx   ON user_badges (user_id, earned_at DESC);
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
    pgm.sql(`
    DROP TABLE IF EXISTS user_badges CASCADE;
    DROP TABLE IF EXISTS badges CASCADE;
  `);
};
