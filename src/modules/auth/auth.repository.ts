/**
 * @module modules/auth/auth.repository
 * @description
 * Data-access layer for auth workflows, combining PostgreSQL persistence and
 * Redis-backed session, cache, and rate-limit storage.
 */

import { Injectable } from "@nestjs/common";
import { DatabaseService } from "@database/database.service";
import { RedisService } from "@redis/redis.service";
import { BaseRepository } from "@database/base.repository";
import { uuidv7 } from "@common/utils/uuidv7.util";
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

/**
 * Repository for auth-specific reads and writes against the database and Redis.
 * Extends BaseRepository for typed query helpers and cache primitives.
 */
@Injectable()
export class AuthRepository extends BaseRepository {
    /**
     * @param db PostgreSQL database service.
     * @param redis Redis service for auth cache and session state.
     */
    constructor(
        db: DatabaseService,
        redis: RedisService,
    ) {
        super(db, redis);
    }

    /**
     * Check whether an active user exists for the given email.
     *
     * @param email Email address to check.
     * @returns true when a non-deleted user exists.
     */

    async existsByEmail(email: string): Promise<boolean> {
        return await this.existsWhere(
            `SELECT EXISTS(SELECT 1 FROM users WHERE email = $1 AND deleted_at IS NULL) AS exists`,
            [email],
        );
    }

    /**
     * Check whether an active user exists for the given username.
     *
     * @param username Username to check.
     * @returns true when a non-deleted user exists.
     */
    async existsByUsername(username: string): Promise<boolean> {
        return await this.existsWhere(
            `SELECT EXISTS(SELECT 1 FROM users WHERE username = $1 AND deleted_at IS NULL) AS exists`,
            [username],
        );
    }

    /**
     * Returns only the IDs that actually exist in the tags table.
     * Used during registration to validate onboarding topic selections.
     *
     * @deprecated Phase 5 - this will be replaced by injecting TagValidator
     *             (a narrow ISP-compliant abstract class) so auth module no
     *             longer needs a cross-module DB call inside AuthRepository.
     * @param tagIds Candidate topic IDs.
     * @returns Matching tag IDs found in persistence.
     */
    async validateTagIds(tagIds: string[]): Promise<string[]> {
        if (!tagIds.length) return [];
        const rows = await this.findMany<{ id: string }>(
            `SELECT id FROM tags WHERE id = ANY($1)`,
            [tagIds],
        );
        return rows.map((r) => r.id);
    }

    /**
     * Creates the user row and seeds user_topic_affinity in a single transaction.
     *
     * @param data Registration persistence payload.
     * @returns Newly created user entity.
     */
    async createUserWithAffinity(
        data: CreateUserWithAffinityData,
    ): Promise<User> {
        const id = uuidv7();
        const now = new Date().toISOString();

        return await this.db.withTransaction(async (client) => {
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
                [id, data.email, data.password_hash, data.username, data.experience_level, now],
            );

            const user = userResult.rows[0];

            // Seed affinity scores - bulk insert for all topics
            if (data.topics.length > 0) {
                const values = data.topics
                    .map((_, i) => `($1, $${i + 2}, 1.0, $${data.topics.length + 2})`)
                    .join(", ");
                await client.query(
                    `INSERT INTO user_topic_affinity (user_id, tag_id, score, updated_at)
                     VALUES ${values}`,
                    [id, ...data.topics, now],
                );
            }

            return user;
        });
    }


    /**
     * Fetch an active user by email address.
     *
     * @param email User email.
     * @returns Matching user or null.
     */

    async findByEmail(email: string): Promise<User | null> {
        return await this.findOne<User>(
            `SELECT
         id, email, password_hash, account_status,
         token_version, username, role, experience_level,
         total_xp, token_balance, current_streak,
         avatar_url, created_at
       FROM users
       WHERE email = $1 AND deleted_at IS NULL`,
            [email],
        );
    }

    /**
     * Fetch an active user by unique identifier.
     *
     * @param userId User UUID.
     * @returns Matching user or null.
     */
    async findById(userId: string): Promise<User | null> {
        return await this.findOne<User>(
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
    }

    /**
     * Resolve a user through a linked OAuth provider identity.
     *
     * @param provider OAuth provider name.
     * @param providerUserId Provider-specific user identifier.
     * @returns Matching linked user or null.
     */
    async findByOAuthProvider(
        provider: string,
        providerUserId: string,
    ): Promise<User | null> {
        return await this.findOne<User>(
            `SELECT u.*
       FROM users u
       JOIN oauth_accounts oa ON oa.user_id = u.id
       WHERE oa.provider = $1
         AND oa.provider_user_id = $2
         AND u.deleted_at IS NULL`,
            [provider, providerUserId],
        );
    }

    /**
     * Links an OAuth provider identity to an existing user.
        *
        * @param data OAuth account link payload.
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

    /**
     * Creates a new user with password_hash = NULL and the linked OAuth account
     * in a single transaction.
        *
        * @param data OAuth user creation payload.
        * @returns Newly created user entity.
     */
    async createOAuthUser(data: CreateOAuthUserData): Promise<User> {
        const userId = uuidv7();
        const oauthId = uuidv7();
        const now = new Date().toISOString();

        return await this.db.withTransaction(async (client) => {
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

            return userResult.rows[0];
        });
    }


    /**
     * Increments token_version in DB and evicts the Redis cache entry.
        *
        * @param userId User UUID.
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

    /**
     * Read current failed-login count for an IP/email tuple.
     *
     * @param ip Caller IP address.
     * @param email Login email address.
     * @returns Failed-attempt count.
     */

    async getLoginAttempts(ip: string, email: string): Promise<number> {
        const value = await this.redis.get(
            `${AUTH_REDIS_KEYS.LOGIN_ATTEMPTS_PREFIX}:${ip}:${email}`,
        );
        return value !== null ? parseInt(value, 10) : 0;
    }

    /**
     * Read remaining TTL for a failed-login counter key.
     *
     * @param ip Caller IP address.
     * @param email Login email address.
     * @returns TTL in seconds.
     */
    async getLoginAttemptsTtl(ip: string, email: string): Promise<number> {
        return this.redis.ttl(
            `${AUTH_REDIS_KEYS.LOGIN_ATTEMPTS_PREFIX}:${ip}:${email}`,
        );
    }

    /**
     * Increment the failed-login counter and apply rate-limit expiry.
     *
     * @param ip Caller IP address.
     * @param email Login email address.
     */
    async incrementLoginAttempts(ip: string, email: string): Promise<void> {
        const key = `${AUTH_REDIS_KEYS.LOGIN_ATTEMPTS_PREFIX}:${ip}:${email}`;
        await this.redis.incr(key);
        await this.redis.expire(key, AUTH_TTL.LOGIN_WINDOW_SECONDS);
    }

    /**
     * Clear failed-login tracking after successful authentication.
     *
     * @param ip Caller IP address.
     * @param email Login email address.
     */
    async clearLoginAttempts(ip: string, email: string): Promise<void> {
        await this.redis.del(
            `${AUTH_REDIS_KEYS.LOGIN_ATTEMPTS_PREFIX}:${ip}:${email}`,
        );
    }

    /**
     * Persist a hashed refresh token under a token family key.
     *
     * @param userId User UUID.
     * @param tokenFamily Token-family UUID.
     * @param hash Bcrypt hash of the refresh token.
     */

    async storeRefreshToken(
        userId: string,
        tokenFamily: string,
        hash: string,
    ): Promise<void> {
        // TTL = 30 days
        await this.redis.set(
            `${AUTH_REDIS_KEYS.REFRESH_TOKEN_PREFIX}:${userId}:${tokenFamily}`,
            hash,
            parseInt(AUTH_TTL.REFRESH_TOKEN_SECONDS, 10),
        );
    }

    /**
     * Fetch the stored refresh-token hash for a token family.
     *
     * @param userId User UUID.
     * @param tokenFamily Token-family UUID.
     * @returns Stored hash or null.
     */
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
     *
     * @param userId User UUID.
     * @param tokenFamily Token-family UUID.
     * @param newHash New bcrypt hash for rotated refresh token.
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
            parseInt(AUTH_TTL.REFRESH_TOKEN_SECONDS, 10),
        );
    }

    /**
     * Revokes every session for a user by deleting all refresh:{userId}:* keys.
        *
        * @param userId User UUID.
     */
    async revokeAllSessions(userId: string): Promise<void> {
        await this.redis.deletePattern(
            `${AUTH_REDIS_KEYS.REFRESH_TOKEN_PREFIX}:${userId}:*`,
        );
    }

    /**
     * Delete a single stored refresh token family.
     *
     * @param userId User UUID.
     * @param tokenFamily Token-family UUID.
     */
    async deleteRefreshToken(
        userId: string,
        tokenFamily: string,
    ): Promise<void> {
        await this.redis.del(
            `${AUTH_REDIS_KEYS.REFRESH_TOKEN_PREFIX}:${userId}:${tokenFamily}`,
        );
    }
}
