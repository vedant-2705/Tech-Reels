/**
 * @module database/database.service
 * @description
 * PostgreSQL service wrapper for pooled query execution and manual
 * transaction management.
 */

import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool, PoolClient, QueryResult } from "pg";

/**
 * Provides typed query helpers and transaction client access to PostgreSQL.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
    private pool: Pool;

    /**
     * @param config Runtime configuration provider.
     */
    constructor(private readonly config: ConfigService) {
        this.pool = new Pool({
            host: this.config.get<string>("DB_HOST"),
            port: this.config.get<number>("DB_PORT"),
            database: this.config.get<string>("DB_NAME"),
            user: this.config.get<string>("DB_USER"),
            password: this.config.get<string>("DB_PASSWORD"),
            max: 20,
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 5_000,
        });
    }

    /**
     * Verify initial database connectivity during application bootstrap.
     */
    async onModuleInit(): Promise<void> {
        // Eagerly verify DB connectivity on startup so we fail fast
        const client = await this.pool.connect();
        client.release();
    }

    /**
     * Gracefully close the PostgreSQL connection pool on shutdown.
     */
    async onModuleDestroy(): Promise<void> {
        await this.pool.end();
    }

    /**
     * Execute a parameterised query.
     * Use $1, $2, ... placeholders - never string interpolation.
    *
    * @param text SQL query text with positional placeholders.
    * @param params Optional query parameter values.
    * @returns Typed PostgreSQL query result.
     *
     * @example
     * const result = await this.db.query<User>(
     *   'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
     *   [userId],
     * );
     * return result.rows[0] ?? null;
     */
    async query<T extends Record<string, unknown> = Record<string, unknown>>(
        text: string,
        params?: unknown[],
    ): Promise<QueryResult<T>> {
        return this.pool.query<T>(text, params);
    }

    /**
     * Acquire a raw client for manual transaction management.
     * Always release the client in a finally block.
    *
    * @returns Connected pool client for explicit transaction control.
     *
     * @example
     * const client = await this.db.getClient();
     * try {
     *   await client.query('BEGIN');
     *   // ... queries ...
     *   await client.query('COMMIT');
     * } catch (err) {
     *   await client.query('ROLLBACK');
     *   throw err;
     * } finally {
     *   client.release();
     * }
     */
    async getClient(): Promise<PoolClient> {
        return this.pool.connect();
    }
}
