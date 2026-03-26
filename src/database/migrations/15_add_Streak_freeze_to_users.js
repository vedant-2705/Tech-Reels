/**
 * Migration: 015_add_streak_freeze_to_users
 *
 * Adds streak_freeze_until DATE column to the users table.
 *
 * Purpose:
 *   Enables a 1-day streak grace period. When a user misses a day their
 *   streak is not immediately reset - instead streak_freeze_until is set
 *   to tomorrow's date. If they return before that date their streak is
 *   preserved. If they miss again (today > streak_freeze_until) the streak
 *   resets to 0 and the freeze is cleared.
 *
 * NULL = no active freeze (default state).
 * DATE (not TIMESTAMPTZ) - streak logic is day-granularity, UTC.
 *
 * Safe for existing data: ADD COLUMN with NULL default fills all rows
 * instantly without a table rewrite.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
    pgm.sql(`
    ALTER TABLE users
      ADD COLUMN streak_freeze_until DATE NULL DEFAULT NULL;

    COMMENT ON COLUMN users.streak_freeze_until IS
      'UTC date until which the streak is frozen (grace period). NULL = no active freeze. '
      'Set to tomorrow when a user misses a day. Cleared on return or expiry.';

    CREATE INDEX users_streak_freeze_idx
      ON users (streak_freeze_until)
      WHERE streak_freeze_until IS NOT NULL;
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
    pgm.sql(`
    DROP INDEX IF EXISTS users_streak_freeze_idx;
    ALTER TABLE users DROP COLUMN IF EXISTS streak_freeze_until;
  `);
};
