/**
 * Migration: 001_create_users
 *
 * Core user accounts table.
 * Soft-deleted via deleted_at - never hard deleted.
 * password_hash is NULL for pure OAuth users.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const up = (pgm) => {
    pgm.sql(`
    CREATE TABLE users (
      id                   UUID          PRIMARY KEY,
      email                VARCHAR(255)  UNIQUE NOT NULL,
      password_hash        TEXT          NULL,
      username             VARCHAR(50)   UNIQUE NOT NULL,
      avatar_url           TEXT          NULL,
      bio                  VARCHAR(300)  NULL,
      role                 VARCHAR(20)   NOT NULL DEFAULT 'user'
                             CONSTRAINT users_role_check
                             CHECK (role IN ('user', 'admin')),
      experience_level     VARCHAR(20)   NOT NULL DEFAULT 'novice'
                             CONSTRAINT users_experience_level_check
                             CHECK (experience_level IN ('novice', 'intermediate', 'advanced')),
      account_status       VARCHAR(20)   NOT NULL DEFAULT 'active'
                             CONSTRAINT users_account_status_check
                             CHECK (account_status IN ('active', 'suspended', 'banned', 'deactivated')),
      token_version        INTEGER       NOT NULL DEFAULT 0,
      total_xp             INTEGER       NOT NULL DEFAULT 0,
      token_balance        INTEGER       NOT NULL DEFAULT 0,
      current_streak       INTEGER       NOT NULL DEFAULT 0,
      longest_streak       INTEGER       NOT NULL DEFAULT 0,
      last_active_date     DATE          NULL,
      public_profile_token VARCHAR(64)   NULL,
      created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
      updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
      deleted_at           TIMESTAMPTZ   NULL
    );

    -- Unique constraint on public_profile_token (nullable unique requires partial index)
    CREATE UNIQUE INDEX users_public_profile_token_uniq
      ON users (public_profile_token)
      WHERE public_profile_token IS NOT NULL;

    -- Partial indexes - only cover active (non-deleted) rows for efficient lookups
    CREATE INDEX users_email_active_idx
      ON users (email)
      WHERE deleted_at IS NULL;

    CREATE INDEX users_username_active_idx
      ON users (username)
      WHERE deleted_at IS NULL;

    CREATE INDEX users_public_profile_token_idx
      ON users (public_profile_token)
      WHERE public_profile_token IS NOT NULL;

    CREATE INDEX users_account_status_idx
      ON users (account_status)
      WHERE deleted_at IS NULL;
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const down = (pgm) => {
    pgm.sql(`DROP TABLE IF EXISTS users CASCADE;`);
};
