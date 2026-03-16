/**
 * Migration: 002_create_oauth_accounts
 *
 * Links OAuth provider identities to local user accounts.
 * One user can have multiple providers linked (google + github).
 * provider_user_id is the unique ID from the OAuth provider.
 * Provider access tokens are NEVER stored here - discarded after profile fetch.
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
    pgm.sql(`
    CREATE TABLE oauth_accounts (
      id                UUID          PRIMARY KEY,
      user_id           UUID          NOT NULL
                          REFERENCES users (id) ON DELETE CASCADE,
      provider          VARCHAR(20)   NOT NULL
                          CONSTRAINT oauth_accounts_provider_check
                          CHECK (provider IN ('google', 'github')),
      provider_user_id  VARCHAR(255)  NOT NULL,
      linked_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),

      CONSTRAINT oauth_accounts_provider_user_uniq
        UNIQUE (provider, provider_user_id),

      CONSTRAINT oauth_accounts_user_provider_uniq
        UNIQUE (user_id, provider)
    );

    CREATE INDEX oauth_accounts_user_id_idx
      ON oauth_accounts (user_id);

    CREATE INDEX oauth_accounts_provider_lookup_idx
      ON oauth_accounts (provider, provider_user_id);
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
    pgm.sql(`DROP TABLE IF EXISTS oauth_accounts CASCADE;`);
};
