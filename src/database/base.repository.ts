/**
 * @module database/base.repository
 * @description
 * Abstract base class for all repositories in the application.
 *
 * Provides typed, reusable primitives so derived classes only write SQL
 * without repeating scaffolding. Does NOT know any table name - derived
 * classes own all SQL strings (required because every query in this
 * codebase uses JOINs, json_agg, COALESCE, or composite result types
 * that cannot be auto-generated from a table name).
 *
 * Pattern rules (all repositories must follow):
 *   - DB helpers:    findOne, findMany, existsWhere, parseCount - raw SQL in, typed domain out
 *   - Cache helpers: cacheGet, cacheSet, cacheDel - JSON parse/stringify with guard
 *   - No AppExceptions thrown here - repositories return domain types or null
 *   - No business logic - orchestration belongs to the service layer
 */

import { DatabaseService } from "./database.service";
import { RedisService } from "@redis/redis.service";

/**
 * Abstract base providing typed helper primitives shared by all repositories.
 * Every repository extends this class and receives DatabaseService + RedisService
 * via NestJS DI through the derived class constructor.
 */
export abstract class BaseRepository {
    constructor(
        protected readonly db: DatabaseService,
        protected readonly redis: RedisService,
    ) {}

    // =========================================================================
    // DB helpers
    // =========================================================================

    /**
     * Execute a parameterised query and return the first row, or null.
     * Use for single-entity lookups (findById, findByEmail, etc.).
     *
     * @param sql    Parameterised SQL query (use $1, $2, ... placeholders).
     * @param params Query parameter values.
     * @returns First matching row typed as T, or null if no rows returned.
     *
     * @example
     * return this.findOne<User>(
     *   'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
     *   [userId],
     * );
     */
    protected async findOne<T extends Record<string, unknown>>(
        sql: string,
        params: unknown[],
    ): Promise<T | null> {
        const result = await this.db.query<T>(sql, params);
        return result.rows[0] ?? null;
    }

    /**
     * Execute a parameterised query and return all rows.
     * Use for list queries (findAll, findByCreator, etc.).
     *
     * @param sql    Parameterised SQL query.
     * @param params Optional query parameter values.
     * @returns Array of rows typed as T (empty array if no rows returned).
     *
     * @example
     * return this.findMany<Tag>(
     *   'SELECT id, name, category FROM tags WHERE category = $1',
     *   [category],
     * );
     */
    protected async findMany<T extends Record<string, unknown>>(
        sql: string,
        params?: unknown[],
    ): Promise<T[]> {
        const result = await this.db.query<T>(sql, params);
        return result.rows;
    }

    /**
     * Execute an EXISTS(...) query and return the boolean result.
     * The SQL must select a single column aliased as "exists".
     *
     * @param sql    EXISTS query: SELECT EXISTS(SELECT 1 FROM ...) AS exists
     * @param params Query parameter values.
     * @returns true if the inner SELECT returns at least one row.
     *
     * @example
     * return this.existsWhere(
     *   'SELECT EXISTS(SELECT 1 FROM users WHERE email = $1 AND deleted_at IS NULL) AS exists',
     *   [email],
     * );
     */
    protected async existsWhere(
        sql: string,
        params: unknown[],
    ): Promise<boolean> {
        const result = await this.db.query<{ exists: boolean }>(sql, params);
        return result.rows[0]?.exists ?? false;
    }

    /**
     * Parse a COUNT(*) string column returned by PostgreSQL into a number.
     * pg always returns COUNT as a string - this centralises the parseInt call.
     *
     * @param raw Raw string value from the COUNT(*) column, or undefined.
     * @returns Parsed integer, defaulting to 0 on undefined or empty input.
     *
     * @example
     * const { count } = (await this.db.query<{ count: string }>(...)).rows[0];
     * return this.parseCount(count);
     */
    protected parseCount(raw: string | undefined | null): number {
        return parseInt(raw ?? "0", 10);
    }

    // =========================================================================
    // Cache helpers
    // =========================================================================

    /**
     * Attempt a cache hit. Returns the deserialised value or null on miss/error.
     * JSON parse errors are caught silently and treated as a cache miss so a
     * corrupt cache entry never propagates to the caller.
     *
     * @param key Redis key to read.
     * @returns Parsed value typed as T, or null on miss or parse failure.
     */
    protected async cacheGet<T>(key: string): Promise<T | null> {
        const raw = await this.redis.get(key);
        if (!raw) return null;
        try {
            return JSON.parse(raw) as T;
        } catch {
            return null;
        }
    }

    /**
     * Serialise a value and write it to Redis with a TTL.
     * Null is never cached - callers should guard before calling this method.
     *
     * @param key   Redis key to write.
     * @param value Value to serialise as JSON.
     * @param ttl   Time-to-live in seconds.
     */
    protected async cacheSet<T>(
        key: string,
        value: T,
        ttl: number,
    ): Promise<void> {
        await this.redis.set(key, JSON.stringify(value), ttl);
    }
}
