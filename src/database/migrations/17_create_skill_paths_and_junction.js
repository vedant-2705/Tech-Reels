/**
 * Migration: 017_create_skill_paths_and_junction
 *
 * Creates two tables:
 *
 * 1. skill_paths
 *    Admin-managed curated learning paths. Each path is an ordered sequence
 *    of reels grouped into a structured curriculum.
 *
 *    thumbnail_url: full URL (not an S3 key) - admin provides a cover image URL
 *    directly. Distinct from reels.thumbnail_key which requires CDN conversion.
 *
 *    total_reels / estimated_duration_minutes: denormalised counters kept in
 *    sync by the service on every create/update. Avoids a COUNT join on every
 *    list read.
 *
 *    Soft-deleted via deleted_at. is_published controls visibility to users.
 *
 *    difficulty: reuses the difficulty_level enum created in migration 010.
 *
 * 2. skill_path_reels (junction)
 *    Maps reels to paths with an explicit order. Hard-delete only - no
 *    soft-delete on a junction table. The entire set is replaced atomically
 *    in a transaction when the admin updates a path's reel list.
 *
 *    "order" is quoted because ORDER is a SQL reserved word.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
    pgm.sql(`
        CREATE TABLE skill_paths (
            id                          UUID              PRIMARY KEY,
            title                       VARCHAR(150)      NOT NULL,
            description                 TEXT              NOT NULL,
            difficulty                  difficulty_level  NOT NULL,
            thumbnail_url               TEXT              NULL,
            total_reels                 INTEGER           NOT NULL DEFAULT 0,
            estimated_duration_minutes  INTEGER           NOT NULL DEFAULT 0,
            is_published                BOOLEAN           NOT NULL DEFAULT false,
            created_by                  UUID              NOT NULL REFERENCES users (id),
            created_at                  TIMESTAMPTZ       NOT NULL DEFAULT now(),
            updated_at                  TIMESTAMPTZ       NOT NULL DEFAULT now(),
            deleted_at                  TIMESTAMPTZ       NULL
        );

        -- Filter to published, non-deleted paths for the user-facing list endpoint
        CREATE INDEX skill_paths_published_idx
            ON skill_paths (is_published, created_at DESC)
            WHERE deleted_at IS NULL;

        -- Difficulty filter on the list endpoint
        CREATE INDEX skill_paths_difficulty_idx
            ON skill_paths (difficulty, created_at DESC)
            WHERE is_published = true AND deleted_at IS NULL;

        CREATE INDEX skill_paths_created_by_idx
            ON skill_paths (created_by)
            WHERE deleted_at IS NULL;


        -- ----------------------------------------------------------------
        -- skill_path_reels: ordered junction between skill_paths and reels
        -- ----------------------------------------------------------------

        CREATE TABLE skill_path_reels (
            path_id   UUID      NOT NULL REFERENCES skill_paths (id) ON DELETE CASCADE,
            reel_id   UUID      NOT NULL REFERENCES reels (id)       ON DELETE CASCADE,
            "order"   SMALLINT  NOT NULL,
            added_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

            PRIMARY KEY (path_id, reel_id)
        );

        -- Ordered reel list lookup for a path (getPathReels)
        CREATE INDEX skill_path_reels_path_order_idx
            ON skill_path_reels (path_id, "order" ASC);

        -- Reverse lookup: which paths contain a given reel (subscriber query)
        CREATE INDEX skill_path_reels_reel_id_idx
            ON skill_path_reels (reel_id);
    `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
    pgm.sql(`
        DROP TABLE IF EXISTS skill_path_reels CASCADE;
        DROP TABLE IF EXISTS skill_paths CASCADE;
    `);
};
