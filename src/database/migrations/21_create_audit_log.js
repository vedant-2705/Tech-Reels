/**
 * Migration: 021_create_audit_log
 *
 * Append-only audit log, partitioned by created_at (monthly RANGE partitioning).
 *
 * Design decisions:
 *   - No PK on the root table - required for declarative range partitioning.
 *     UNIQUE (id, created_at) is used instead so each row is still uniquely
 *     identifiable and the partition key is included in the constraint.
 *   - No FK constraints - audit_log must never block writes due to a missing
 *     referenced row. Referential integrity is sacrificed intentionally for
 *     write throughput and reliability.
 *   - Append-only: no UPDATE, no DELETE ever. Violated rows become permanent record.
 *   - Indexes created on the parent propagate to all partitions automatically
 *     in PostgreSQL 11+.
 *
 * Partition strategy:
 *   Add a new monthly partition via ALTER TABLE each month before the month starts.
 *   Initial partitions cover the current launch window: 2026-03 and 2026-04.
 *
 * audit_category matches the pub/sub channel taxonomy in Foundation §14.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
    pgm.sql(`
        CREATE TYPE audit_category AS ENUM (
            'user_interaction',
            'video_telemetry',
            'transactional',
            'content_event'
        );

        CREATE TABLE audit_log (
            id           UUID           NOT NULL,
            event_type   VARCHAR(50)    NOT NULL,
            category     audit_category NOT NULL,
            user_id      UUID           NULL,
            entity_id    UUID           NULL,
            entity_type  VARCHAR(50)    NULL,
            payload      JSONB          NOT NULL,
            created_at   TIMESTAMPTZ    NOT NULL DEFAULT now(),

            CONSTRAINT audit_log_id_created_at_uniq UNIQUE (id, created_at)
        ) PARTITION BY RANGE (created_at);

        -- Initial partitions - add new monthly partitions before each month starts
        CREATE TABLE audit_log_2026_03
            PARTITION OF audit_log
            FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

        CREATE TABLE audit_log_2026_04
            PARTITION OF audit_log
            FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

        -- Indexes on parent table propagate to all existing and future partitions
        CREATE INDEX idx_audit_user_id    ON audit_log (user_id,                    created_at DESC);
        CREATE INDEX idx_audit_event_type ON audit_log (event_type,                 created_at DESC);
        CREATE INDEX idx_audit_category   ON audit_log (category,                   created_at DESC);
        CREATE INDEX idx_audit_entity     ON audit_log (entity_id, entity_type,     created_at DESC);
    `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
    pgm.sql(`
        DROP TABLE IF EXISTS audit_log_2026_04;
        DROP TABLE IF EXISTS audit_log_2026_03;
        DROP TABLE IF EXISTS audit_log CASCADE;
        DROP TYPE IF EXISTS audit_category;
    `);
};
