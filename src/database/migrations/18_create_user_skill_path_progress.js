/**
 * Migration: 018_create_user_skill_path_progress
 *
 * Append-only record of every reel a user has completed within a specific path.
 * Driven by the REEL_WATCH_ENDED pub/sub event when completion_pct >= 80.
 *
 * Design notes:
 *   - Composite PK (user_id, path_id, reel_id) enforces idempotency at the
 *     DB level. ON CONFLICT DO NOTHING in recordReelProgress is the guard.
 *
 *   - No soft-delete. Rows are hard-deleted on unenrol and on re-enrol reset
 *     (deleteProgress). This is intentional - a fresh re-enrol starts from zero.
 *
 *   - reel_id references reels(id) - if a reel is hard-deleted (it isn't, reels
 *     are soft-deleted) the FK would cascade. In practice reels are soft-deleted
 *     so reel rows always exist. The FK is still correct for referential integrity.
 *
 *   - path_id has no direct FK here because the composite PK query always
 *     joins through user_skill_paths first. A FK to skill_paths is added
 *     for explicit referential integrity.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
    pgm.sql(`
        CREATE TABLE user_skill_path_progress (
            user_id     UUID        NOT NULL REFERENCES users       (id) ON DELETE CASCADE,
            path_id     UUID        NOT NULL REFERENCES skill_paths (id) ON DELETE CASCADE,
            reel_id     UUID        NOT NULL REFERENCES reels       (id) ON DELETE CASCADE,
            watched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

            PRIMARY KEY (user_id, path_id, reel_id)
        );

        -- Lookup all completed reels for a user in a specific path (getUserProgress)
        CREATE INDEX uspp_user_path_idx
            ON user_skill_path_progress (user_id, path_id);

        -- Reverse lookup: which users have completed a reel across any path (analytics)
        CREATE INDEX uspp_reel_id_idx
            ON user_skill_path_progress (reel_id);
    `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
    pgm.sql(`
        DROP TABLE IF EXISTS user_skill_path_progress CASCADE;
    `);
};
