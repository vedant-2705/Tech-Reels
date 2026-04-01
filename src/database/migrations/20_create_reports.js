/**
 * Migration: 020_create_reports
 *
 * Moderation reports table.
 * One report per user per reel - enforced via UNIQUE (reporter_id, reel_id).
 * Append-only for reporters: once submitted, reporters cannot edit or delete.
 * Admins update status + reviewed_by + reviewed_at via the Admin module.
 *
 * reporter_id references users - reporter must be a registered user.
 * reviewed_by references users - the admin who actioned the report. NULL = unreviewed.
 *
 * Note: reel_id does NOT have ON DELETE CASCADE intentionally.
 * Reports should persist even if a reel is soft-deleted - they are the audit
 * trail of why moderation happened. Hard FK without cascade is correct here.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
    pgm.sql(`
        CREATE TYPE report_reason AS ENUM (
            'spam',
            'misleading',
            'inappropriate',
            'hate_speech',
            'illegal_content',
            'other'
        );

        CREATE TYPE report_status AS ENUM (
            'pending',
            'actioned',
            'dismissed',
            'escalated'
        );

        CREATE TABLE reports (
            id           UUID          PRIMARY KEY,
            reporter_id  UUID          NOT NULL REFERENCES users (id),
            reel_id      UUID          NOT NULL REFERENCES reels (id),
            reason       report_reason NOT NULL,
            details      TEXT          NULL,
            status       report_status NOT NULL DEFAULT 'pending',
            reviewed_by  UUID          NULL REFERENCES users (id),
            reviewed_at  TIMESTAMPTZ   NULL,
            created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),

            CONSTRAINT reports_reporter_reel_uniq UNIQUE (reporter_id, reel_id)
        );

        CREATE INDEX idx_reports_reel_id     ON reports (reel_id,     created_at DESC);
        CREATE INDEX idx_reports_status      ON reports (status,      created_at DESC);
        CREATE INDEX idx_reports_reporter_id ON reports (reporter_id);
    `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
    pgm.sql(`
        DROP TABLE IF EXISTS reports CASCADE;
        DROP TYPE IF EXISTS report_status;
        DROP TYPE IF EXISTS report_reason;
    `);
};
