import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service";
import { RedisService } from "../../redis/redis.service";
import { uuidv7 } from "../../common/utils/uuidv7.util";
import { ExperienceLevel, User } from "./entities/user.entity";
import { AUTH_REDIS_KEYS, AUTH_TTL, OAuthProvider } from "./auth.constants";

interface CreateUserWithAffinityData {
    email: string;
    password_hash: string;
    username: string;
    experience_level: ExperienceLevel;
    topics: string[];
}

interface CreateOAuthUserData {
    email: string;
    username: string;
    avatar_url: string | null;
    provider: OAuthProvider;
    provider_user_id: string;
}

interface LinkOAuthAccountData {
    userId: string;
    provider: OAuthProvider;
    provider_user_id: string;
}

//  Repository 

/**
 * AuthRepository - all DB and Cache access for the Auth module.
 *
 * Rules (from Foundation doc):
 * - Depends only on DatabaseService and RedisService.
 * - NO business logic here - only data access.
 * - Methods return domain types or primitives - never throw AppExceptions.
 * - All SQL uses $1, $2, ... placeholders - never string interpolation.
 * - All queries on users table include: AND deleted_at IS NULL.
 * - Transactions use getClient() with explicit BEGIN/COMMIT/ROLLBACK.
 */
@Injectable()
export class AuthRepository {
    constructor(
        private readonly db: DatabaseService,
        private readonly redis: RedisService,
    ) {}

    //  DB: existence checks 

    async existsByEmail(email: string): Promise<boolean> {
        const result = await this.db.query<{ exists: boolean }>(
            `SELECT EXISTS(
         SELECT 1 FROM users
         WHERE email = $1 AND deleted_at IS NULL
       ) AS exists`,
            [email],
        );
        return result.rows[0]?.exists ?? false;
    }

    async existsByUsername(username: string): Promise<boolean> {
        const result = await this.db.query<{ exists: boolean }>(
            `SELECT EXISTS(
         SELECT 1 FROM users
         WHERE username = $1 AND deleted_at IS NULL
       ) AS exists`,
            [username],
        );
        return result.rows[0]?.exists ?? false;
    }

    //  DB: tag validation 

    /**
     * Returns only the IDs that actually exist in the tags table.
     * Caller compares count against the input array to detect invalid IDs.
     */
    async validateTagIds(tagIds: string[]): Promise<string[]> {
        const result = await this.db.query<{ id: string }>(
            `SELECT id FROM tags WHERE id = ANY($1)`,
            [tagIds],
        );
        return result.rows.map((r) => r.id);
    }

    //  DB: create user (email registration) 

    /**
     * Creates the user row and seeds user_topic_affinity in a single transaction.
     * score = 1.0 per selected topic as per the LLD.
     */
    async createUserWithAffinity(
        data: CreateUserWithAffinityData,
    ): Promise<User> {
        const client = await this.db.getClient();
        const id = uuidv7();
        const now = new Date().toISOString();

        try {
            await client.query("BEGIN");

            const userResult = await client.query<User>(
                `INSERT INTO users (
                    id, email, password_hash, username, role,
                    experience_level, account_status, token_version,
                    total_xp, current_streak, token_balance,
                    created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, 'user',
                    $5, 'active', 0,
                    0, 0, 0,
                    $6, $6
                ) RETURNING *`,
                [
                    id,
                    data.email,
                    data.password_hash,
                    data.username,
                    data.experience_level,
                    now,
                ],
            );

            const user = userResult.rows[0];

            // Seed affinity scores - one row per topic, score = 1.0
            for (const tagId of data.topics) {
                await client.query(
                    `INSERT INTO user_topic_affinity (user_id, tag_id, score, updated_at)
           VALUES ($1, $2, 1.0, $3)`,
                    [id, tagId, now],
                );
            }

            await client.query("COMMIT");
            return user;
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }
    }

    //  DB: lookups 

    async findByEmail(email: string): Promise<User | null> {
        const result = await this.db.query<User>(
            `SELECT
         id, email, password_hash, account_status,
         token_version, username, role, experience_level,
         total_xp, token_balance, current_streak,
         avatar_url, created_at
       FROM users
       WHERE email = $1 AND deleted_at IS NULL`,
            [email],
        );
        return result.rows[0] ?? null;
    }

    async findById(userId: string): Promise<User | null> {
        const result = await this.db.query<User>(
            `SELECT
         id, email, account_status, token_version,
         role, username, experience_level, total_xp,
         token_balance, current_streak, longest_streak,
         last_active_date, avatar_url, bio,
         public_profile_token, created_at
       FROM users
       WHERE id = $1 AND deleted_at IS NULL`,
            [userId],
        );
        return result.rows[0] ?? null;
    }

    async findByOAuthProvider(
        provider: string,
        providerUserId: string,
    ): Promise<User | null> {
        const result = await this.db.query<User>(
            `SELECT u.*
       FROM users u
       JOIN oauth_accounts oa ON oa.user_id = u.id
       WHERE oa.provider = $1
         AND oa.provider_user_id = $2
         AND u.deleted_at IS NULL`,
            [provider, providerUserId],
        );
        return result.rows[0] ?? null;
    }

    //  DB: OAuth account linking 

    /**
     * Links an OAuth provider identity to an existing user.
     * ON CONFLICT DO NOTHING - idempotent, safe to call multiple times.
     */
    async linkOAuthAccount(data: LinkOAuthAccountData): Promise<void> {
        const id = uuidv7();
        await this.db.query(
            `INSERT INTO oauth_accounts (id, user_id, provider, provider_user_id, linked_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT DO NOTHING`,
            [id, data.userId, data.provider, data.provider_user_id],
        );
    }

    //  DB: create OAuth user (new user via OAuth) 

    /**
     * Creates a new user with password_hash = NULL and the linked OAuth account
     * in a single transaction.
     */
    async createOAuthUser(data: CreateOAuthUserData): Promise<User> {
        const client = await this.db.getClient();
        const userId = uuidv7();
        const oauthId = uuidv7();
        const now = new Date().toISOString();

        try {
            await client.query("BEGIN");

            const userResult = await client.query<User>(
                `INSERT INTO users (
           id, email, password_hash, username, avatar_url,
           role, experience_level, account_status,
           token_version, total_xp, current_streak,
           token_balance, created_at, updated_at
         ) VALUES (
           $1, $2, NULL, $3, $4,
           'user', 'novice', 'active',
           0, 0, 0,
           0, $5, $5
         ) RETURNING *`,
                [userId, data.email, data.username, data.avatar_url, now],
            );

            await client.query(
                `INSERT INTO oauth_accounts (id, user_id, provider, provider_user_id, linked_at)
         VALUES ($1, $2, $3, $4, now())`,
                [oauthId, userId, data.provider, data.provider_user_id],
            );

            await client.query("COMMIT");
            return userResult.rows[0];
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }
    }

    //  DB + Cache: token version 

    /**
     * Increments token_version in DB and evicts the Redis cache entry.
     * All existing JWTs become invalid within 60s (cache TTL in JwtStrategy).
     */
    async incrementTokenVersion(userId: string): Promise<void> {
        await this.db.query(
            `UPDATE users
       SET token_version = token_version + 1,
           updated_at    = now()
       WHERE id = $1`,
            [userId],
        );
        // Force JwtStrategy to reload from DB on next request
        await this.redis.del(`${AUTH_REDIS_KEYS.TOKEN_VERSION_PREFIX}:${userId}`);
    }

    //  Cache: login rate limiting 

    async getLoginAttempts(ip: string, email: string): Promise<number> {
        const value = await this.redis.get(
            `${AUTH_REDIS_KEYS.LOGIN_ATTEMPTS_PREFIX}:${ip}:${email}`,
        );
        return value !== null ? parseInt(value, 10) : 0;
    }

    async getLoginAttemptsTtl(ip: string, email: string): Promise<number> {
        return this.redis.ttl(
            `${AUTH_REDIS_KEYS.LOGIN_ATTEMPTS_PREFIX}:${ip}:${email}`,
        );
    }

    async incrementLoginAttempts(ip: string, email: string): Promise<void> {
        const key = `${AUTH_REDIS_KEYS.LOGIN_ATTEMPTS_PREFIX}:${ip}:${email}`;
        await this.redis.incr(key);
        await this.redis.expire(key, AUTH_TTL.LOGIN_WINDOW_SECONDS);
    }

    async clearLoginAttempts(ip: string, email: string): Promise<void> {
        await this.redis.del(
            `${AUTH_REDIS_KEYS.LOGIN_ATTEMPTS_PREFIX}:${ip}:${email}`,
        );
    }

    //  Cache: refresh token management 

    async storeRefreshToken(
        userId: string,
        tokenFamily: string,
        hash: string,
    ): Promise<void> {
        // TTL = 30 days
        await this.redis.set(
            `${AUTH_REDIS_KEYS.REFRESH_TOKEN_PREFIX}:${userId}:${tokenFamily}`,
            hash,
            AUTH_TTL.REFRESH_TOKEN_SECONDS,
        );
    }

    async getRefreshTokenHash(
        userId: string,
        tokenFamily: string,
    ): Promise<string | null> {
        return this.redis.get(
            `${AUTH_REDIS_KEYS.REFRESH_TOKEN_PREFIX}:${userId}:${tokenFamily}`,
        );
    }

    /**
     * Atomically replaces the stored hash under the same token family.
     * DEL + SETEX - old token is immediately invalid.
     */
    async rotateRefreshToken(
        userId: string,
        tokenFamily: string,
        newHash: string,
    ): Promise<void> {
        await this.redis.del(
            `${AUTH_REDIS_KEYS.REFRESH_TOKEN_PREFIX}:${userId}:${tokenFamily}`,
        );
        await this.redis.set(
            `${AUTH_REDIS_KEYS.REFRESH_TOKEN_PREFIX}:${userId}:${tokenFamily}`,
            newHash,
            AUTH_TTL.REFRESH_TOKEN_SECONDS,
        );
    }

    /**
     * Revokes every session for a user by deleting all refresh:{userId}:* keys.
     * Used by logout-all and token reuse detection.
     */
    async revokeAllSessions(userId: string): Promise<void> {
        await this.redis.deletePattern(
            `${AUTH_REDIS_KEYS.REFRESH_TOKEN_PREFIX}:${userId}:*`,
        );
    }

    async deleteRefreshToken(
        userId: string,
        tokenFamily: string,
    ): Promise<void> {
        await this.redis.del(
            `${AUTH_REDIS_KEYS.REFRESH_TOKEN_PREFIX}:${userId}:${tokenFamily}`,
        );
    }
}
