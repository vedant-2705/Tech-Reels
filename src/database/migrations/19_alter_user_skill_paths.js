/**
 * Migration: 019_alter_user_skill_paths_add_progress_count
 *
 * Adds the progress_count column to the existing user_skill_paths table
 * created in migration 009.
 *
 * progress_count: denormalised counter of how many reels in the path the
 * user has completed. Kept in sync by the VideoTelemetrySubscriber on every
 * REEL_WATCH_ENDED event that passes the 80% completion threshold.
 *
 * Using a denormalised counter here (rather than COUNT(*) on
 * user_skill_path_progress) is intentional:
 *   - getProgress() reads it instantly with no join
 *   - getPaths() merges it into every path list item without N+1 queries
 *   - The progress table is append-only and the counter is the authoritative
 *     read path for "how far along is this user"
 *
 * Safe for existing data: ADD COLUMN with DEFAULT fills all rows instantly
 * without a table rewrite (Postgres stores the default in the catalog for
 * NULLable / constant-default columns, no row scan required).
 *
 * Separate migration because user_skill_paths already exists in production
 * from migration 009. Never edit a deployed migration in place.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
    pgm.sql(`
        ALTER TABLE user_skill_paths
            ADD COLUMN progress_count SMALLINT NOT NULL DEFAULT 0;

        COMMENT ON COLUMN user_skill_paths.progress_count IS
            'Denormalised count of reels completed by this user in this path. '
            'Incremented by VideoTelemetrySubscriber on each qualifying REEL_WATCH_ENDED event. '
            'Reset to 0 on re-enrol. Source of truth for progress reads.';

        ALTER TABLE user_skill_paths
            ADD CONSTRAINT fk_user_skill_paths
            FOREIGN KEY (path_id)
            REFERENCES skill_paths (id);
    `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
    pgm.sql(`
        ALTER TABLE user_skill_paths DROP COLUMN IF EXISTS progress_count;
        ALTER TABLE user_skill_paths DROP CONSTRAINT IF EXISTS fk_user_skill_paths;
    `);
};
