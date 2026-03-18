/**
 * Migration: 09_create_user_skill_paths
 *
 * Tracks user enrolment and progress through skill paths.
 * status: enrolled → in_progress → completed
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
    pgm.sql(`
        CREATE TYPE user_skill_path_status AS ENUM ('in_progress', 'completed');

        CREATE TABLE user_skill_paths (
            id               UUID                   PRIMARY KEY,
            user_id          UUID                   NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            path_id          UUID                   NOT NULL,
            status           user_skill_path_status NOT NULL DEFAULT 'in_progress',
            completed_at     TIMESTAMPTZ            NULL,
            certificate_url  TEXT                   NULL,
            enrolled_at      TIMESTAMPTZ            NOT NULL DEFAULT now(),
            updated_at       TIMESTAMPTZ            NOT NULL DEFAULT now(),
        
            CONSTRAINT user_skill_paths_unique UNIQUE (user_id, path_id)
        );

        CREATE INDEX user_skill_paths_user_id_idx
        ON user_skill_paths (user_id);

        CREATE INDEX user_skill_paths_status_idx
        ON user_skill_paths (user_id, status);
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
    pgm.sql(`
        DROP TABLE IF EXISTS user_skill_paths CASCADE;
        DROP TYPE IF EXISTS user_skill_path_status;    
    `);
};
