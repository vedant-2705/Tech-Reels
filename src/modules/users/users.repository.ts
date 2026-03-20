/**
 * @module modules/users/users.repository
 * @description
 * Data-access layer for the users module. Combines PostgreSQL persistence
 * via DatabaseService and Redis-backed cache operations via RedisService.
 * Contains no business logic - returns domain types or null, never throws
 * AppExceptions.
 */

import { Injectable } from "@nestjs/common";
import { DatabaseService } from "@database/database.service";
import { RedisService } from "@redis/redis.service";
import { User } from "@modules/auth/entities/user.entity";
import { USERS_REDIS_KEYS } from "./users.constants";

// ---------------------------------------------------------------------------
// Local domain types returned by repository methods
// ---------------------------------------------------------------------------

export interface XpLedgerEntry extends Record<string, unknown> {
    id: string;
    delta: number;
    source: string;
    reference_id: string | null;
    note: string | null;
    created_at: string;
}

export interface BadgeEntry extends Record<string, unknown> {
    id: string;
    code: string;
    name: string;
    description: string;
    icon_url: string;
    earned_at: string;
}

export interface ChallengeStats {
    total_attempted: number;
    total_correct: number;
    accuracy_rate: number;
}

export interface TopTopic extends Record<string, unknown> {
    tag_name: string;
    score: number;
}

export interface UpdateProfileData {
    username?: string;
    bio?: string | null;
    clearBio: boolean;
    experience_level?: string;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

/**
 * Repository for user-specific reads and writes against the database
 * and Redis cache.
 */
@Injectable()
export class UsersRepository {
    /**
     * @param db PostgreSQL database service.
     * @param redis Redis service for cache operations.
     */
    constructor(
        private readonly db: DatabaseService,
        private readonly redis: RedisService,
    ) {}

    // -----------------------------------------------------------------------
    // Lookups
    // -----------------------------------------------------------------------

    /**
     * Fetch a non-deleted user by primary key with all profile fields.
     *
     * @param userId User UUID.
     * @returns Matching user or null.
     */
    async findById(userId: string): Promise<User | null> {
        const result = await this.db.query<User>(
            `SELECT
                id, email, username, avatar_url, bio, role, experience_level,
                account_status, total_xp, token_balance, current_streak,
                longest_streak, last_active_date, public_profile_token,
                password_hash, token_version, created_at
             FROM users
             WHERE id = $1 AND deleted_at IS NULL`,
            [userId],
        );
        return result.rows[0] ?? null;
    }

    /**
     * Fetch a non-deleted user by username with public-safe fields.
     *
     * @param username Username to look up.
     * @returns Matching user or null.
     */
    async findByUsername(username: string): Promise<User | null> {
        const result = await this.db.query<User>(
            `SELECT
                id, username, avatar_url, bio, experience_level, total_xp,
                current_streak, longest_streak, account_status, created_at
             FROM users
             WHERE username = $1 AND deleted_at IS NULL`,
            [username],
        );
        return result.rows[0] ?? null;
    }

    /**
     * Fetch a non-deleted user by their public profile token.
     *
     * @param token 64-char hex public profile token.
     * @returns Matching user or null.
     */
    async findByPublicProfileToken(token: string): Promise<User | null> {
        const result = await this.db.query<User>(
            `SELECT
                id, username, avatar_url, bio, experience_level, total_xp,
                current_streak, longest_streak, account_status, created_at
             FROM users
             WHERE public_profile_token = $1 AND deleted_at IS NULL`,
            [token],
        );
        return result.rows[0] ?? null;
    }

    // -----------------------------------------------------------------------
    // Existence checks
    // -----------------------------------------------------------------------

    /**
     * Check whether any non-deleted user owns the given username.
     *
     * @param username Username to check.
     * @returns true when the username is already taken.
     */
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

    /**
     * Check whether the username is taken by any user other than the
     * given excludeUserId. Allows a user to submit their own current
     * username without getting a conflict error.
     *
     * @param username Username to check.
     * @param excludeUserId User UUID to exclude from the check.
     * @returns true when another user already owns this username.
     */
    async existsByUsernameForOtherUser(
        username: string,
        excludeUserId: string,
    ): Promise<boolean> {
        const result = await this.db.query<{ exists: boolean }>(
            `SELECT EXISTS(
                SELECT 1 FROM users
                WHERE username = $1
                  AND id != $2
                  AND deleted_at IS NULL
             ) AS exists`,
            [username, excludeUserId],
        );
        return result.rows[0]?.exists ?? false;
    }

    // -----------------------------------------------------------------------
    // Profile mutations
    // -----------------------------------------------------------------------

    /**
     * Update mutable profile fields. Uses CASE/WHEN for the bio column so
     * that an explicit null (clear bio) is distinguished from an absent
     * value (keep bio unchanged). COALESCE cannot make this distinction.
     *
     * @param userId User UUID.
     * @param data Fields to update. clearBio must be true when dto.bio is
     *             explicitly null.
     * @returns Updated user snapshot.
     */
    async updateProfile(
        userId: string,
        data: UpdateProfileData,
    ): Promise<User> {
        const result = await this.db.query<User>(
            `UPDATE users SET
                username         = COALESCE($2, username),
                bio              = CASE
                                       WHEN $3::text IS NULL AND $4::boolean = true THEN NULL
                                       WHEN $3::text IS NOT NULL                    THEN $3
                                       ELSE bio
                                   END,
                experience_level = COALESCE($5, experience_level),
                updated_at       = now()
             WHERE id = $1
             RETURNING id, username, bio, experience_level, updated_at`,
            [
                userId,
                data.username ?? null,
                data.bio ?? null,
                data.clearBio,
                data.experience_level ?? null,
            ],
        );
        return result.rows[0];
    }

    /**
     * Overwrite the user's experience level.
     *
     * @param userId User UUID.
     * @param level New experience level value.
     */
    async updateExperienceLevel(userId: string, level: string): Promise<void> {
        await this.db.query(
            `UPDATE users
             SET experience_level = $2, updated_at = now()
             WHERE id = $1`,
            [userId, level],
        );
    }

    /**
     * Upsert topic affinity rows for the given tag IDs. Safe to call
     * multiple times - idempotent via ON CONFLICT DO UPDATE.
     *
     * @param userId User UUID.
     * @param tagIds Array of tag UUIDs to seed.
     * @param score Affinity score to assign (typically 1.0).
     */
    async seedTopicAffinity(
        userId: string,
        tagIds: string[],
        score: number,
    ): Promise<void> {
        for (const tagId of tagIds) {
            await this.db.query(
                `INSERT INTO user_topic_affinity (user_id, tag_id, score, updated_at)
                 VALUES ($1, $2, $3, now())
                 ON CONFLICT (user_id, tag_id)
                 DO UPDATE SET score = $3, updated_at = now()`,
                [userId, tagId, score],
            );
        }
    }

    /**
     * Returns only the IDs that actually exist in the tags table.
     *
     * @param tagIds Candidate tag UUIDs to validate.
     * @returns Subset of tagIds that exist in persistence.
     */
    async validateTagIds(tagIds: string[]): Promise<string[]> {
        const result = await this.db.query<{ id: string }>(
            `SELECT id FROM tags WHERE id = ANY($1)`,
            [tagIds],
        );
        return result.rows.map((r) => r.id);
    }

    /**
     * Overwrite the user's avatar_url with a CDN URL.
     *
     * @param userId User UUID.
     * @param avatarUrl Full CDN URL of the confirmed avatar.
     */
    async updateAvatarUrl(userId: string, avatarUrl: string): Promise<void> {
        await this.db.query(
            `UPDATE users
             SET avatar_url = $2, updated_at = now()
             WHERE id = $1`,
            [userId, avatarUrl],
        );
    }

    /**
     * Set the user's account_status (e.g. deactivated, suspended).
     *
     * @param userId User UUID.
     * @param status New account status value.
     */
    async setAccountStatus(userId: string, status: string): Promise<void> {
        await this.db.query(
            `UPDATE users
             SET account_status = $2, updated_at = now()
             WHERE id = $1`,
            [userId, status],
        );
    }

    /**
     * Set or clear the user's public profile token.
     *
     * @param userId User UUID.
     * @param token 64-char hex token, or null to revoke.
     */
    async setPublicProfileToken(
        userId: string,
        token: string | null,
    ): Promise<void> {
        await this.db.query(
            `UPDATE users
             SET public_profile_token = $2, updated_at = now()
             WHERE id = $1`,
            [userId, token],
        );
    }

    // -----------------------------------------------------------------------
    // OAuth
    // -----------------------------------------------------------------------

    /**
     * Retrieve all OAuth provider names linked to a user account.
     *
     * @param userId User UUID.
     * @returns Array of provider name strings e.g. ['google', 'github'].
     */
    async getLinkedProviders(userId: string): Promise<string[]> {
        const result = await this.db.query<{ provider: string }>(
            `SELECT provider FROM oauth_accounts WHERE user_id = $1`,
            [userId],
        );
        return result.rows.map((r) => r.provider);
    }

    // -----------------------------------------------------------------------
    // XP ledger
    // -----------------------------------------------------------------------

    /**
     * Fetch a cursor-paginated slice of the XP ledger for a user,
     * ordered by created_at DESC. When cursor is provided, returns only
     * entries older than the cursor entry's created_at.
     *
     * @param userId User UUID.
     * @param cursor UUID of the last seen entry, or null for first page.
     * @param limit Maximum number of rows to return.
     * @returns Array of XP ledger entries.
     */
    async getXpLedger(
        userId: string,
        cursor: string | null,
        limit: number,
    ): Promise<XpLedgerEntry[]> {
        const result = await this.db.query<XpLedgerEntry>(
            `SELECT id, delta, source, reference_id, note, created_at
             FROM xp_ledger
             WHERE user_id = $1
               AND ($2::uuid IS NULL OR created_at < (
                       SELECT created_at FROM xp_ledger WHERE id = $2
                   ))
             ORDER BY created_at DESC
             LIMIT $3`,
            [userId, cursor, limit],
        );
        return result.rows;
    }

    /**
     * Read the current total_xp value from the users table.
     *
     * @param userId User UUID.
     * @returns Total XP integer.
     */
    async getTotalXp(userId: string): Promise<number> {
        const result = await this.db.query<{ total_xp: number }>(
            `SELECT total_xp FROM users WHERE id = $1`,
            [userId],
        );
        return result.rows[0]?.total_xp ?? 0;
    }

    // -----------------------------------------------------------------------
    // Badges
    // -----------------------------------------------------------------------

    /**
     * Fetch all badges earned by a user, ordered by earned_at DESC.
     *
     * @param userId User UUID.
     * @returns Array of badge entries with badge metadata.
     */
    async getUserBadges(userId: string): Promise<BadgeEntry[]> {
        const result = await this.db.query<BadgeEntry>(
            `SELECT b.id, b.code, b.name, b.description, b.icon_url, ub.earned_at
             FROM user_badges ub
             JOIN badges b ON b.id = ub.badge_id
             WHERE ub.user_id = $1
             ORDER BY ub.earned_at DESC`,
            [userId],
        );
        return result.rows;
    }

    /**
     * Count total badges earned by a user.
     *
     * @param userId User UUID.
     * @returns Badge count.
     */
    async getBadgeCount(userId: string): Promise<number> {
        const result = await this.db.query<{ count: string }>(
            `SELECT COUNT(*) AS count FROM user_badges WHERE user_id = $1`,
            [userId],
        );
        return parseInt(result.rows[0]?.count ?? "0", 10);
    }

    // -----------------------------------------------------------------------
    // Stats queries
    // -----------------------------------------------------------------------

    /**
     * Count total reel watch events for a user.
     * NOTE: table is user_reel_interaction (singular).
     *
     * @param userId User UUID.
     * @returns Watch event count.
     */
    async getReelsWatchedCount(userId: string): Promise<number> {
        const result = await this.db.query<{ count: string }>(
            `SELECT COUNT(*) AS count
             FROM user_reel_interaction
             WHERE user_id = $1 AND interaction_type = 'watch'`,
            [userId],
        );
        return parseInt(result.rows[0]?.count ?? "0", 10);
    }

    /**
     * Aggregate challenge attempt statistics for a user.
     * NOTE: table is challenges_attempts (plural with s).
     *
     * @param userId User UUID.
     * @returns Total attempted, total correct, and accuracy rate.
     */
    async getChallengeStats(userId: string): Promise<ChallengeStats> {
        const result = await this.db.query<{
            total_attempted: string;
            total_correct: string;
        }>(
            `SELECT
                COUNT(*) AS total_attempted,
                SUM(is_correct::int) AS total_correct
             FROM challenges_attempts
             WHERE user_id = $1`,
            [userId],
        );

        const row = result.rows[0];
        const total_attempted = parseInt(row?.total_attempted ?? "0", 10);
        const total_correct = parseInt(row?.total_correct ?? "0", 10);
        const accuracy_rate =
            total_attempted > 0 ? total_correct / total_attempted : 0.0;

        return { total_attempted, total_correct, accuracy_rate };
    }

    /**
     * Count skill paths completed by a user.
     *
     * @param userId User UUID.
     * @returns Completed path count.
     */
    async getPathsCompletedCount(userId: string): Promise<number> {
        const result = await this.db.query<{ count: string }>(
            `SELECT COUNT(*) AS count
             FROM user_skill_paths
             WHERE user_id = $1 AND status = 'completed'`,
            [userId],
        );
        return parseInt(result.rows[0]?.count ?? "0", 10);
    }

    /**
     * Count active published reels created by a user.
     *
     * @param userId User UUID.
     * @returns Active reel count.
     */
    async getReelsCount(userId: string): Promise<number> {
        const result = await this.db.query<{ count: string }>(
            `SELECT COUNT(*) AS count
             FROM reels
             WHERE creator_id = $1 AND status = 'active' AND deleted_at IS NULL`,
            [userId],
        );
        return parseInt(result.rows[0]?.count ?? "0", 10);
    }

    /**
     * Resolve the user's weekly leaderboard rank via Redis.
     * Reads the top tag from the top_tags:{userId} cache key, then calls
     * ZREVRANK on the weekly leaderboard for that tag.
     *
     * @param userId User UUID.
     * @returns 0-based rank integer, or null if not ranked or no top tag.
     */
    async getLeaderboardRank(userId: string): Promise<number | null> {
        const topTagsRaw = await this.redis.get(`top_tags:${userId}`);
        if (!topTagsRaw) return null;

        // topTagsRaw is expected to be a JSON array of tag IDs ordered by score
        let tagIds: string[];
        try {
            tagIds = JSON.parse(topTagsRaw) as string[];
        } catch {
            return null;
        }

        const topTagId = tagIds[0];
        if (!topTagId) return null;

        const rank = await this.redis.zrevrank(
            `leaderboard:weekly:${topTagId}`,
            userId,
        );

        return rank ?? null;
    }

    /**
     * Fetch the top 5 topic affinities for a user, ordered by score DESC.
     *
     * @param userId User UUID.
     * @returns Array of tag name + score pairs.
     */
    async getTopTopics(userId: string): Promise<TopTopic[]> {
        const result = await this.db.query<TopTopic>(
            `SELECT t.name AS tag_name, uta.score
             FROM user_topic_affinity uta
             JOIN tags t ON t.id = uta.tag_id
             WHERE uta.user_id = $1
             ORDER BY uta.score DESC
             LIMIT 5`,
            [userId],
        );
        return result.rows;
    }

    // -----------------------------------------------------------------------
    // Avatar pending cache
    // -----------------------------------------------------------------------

    /**
     * Store the pending avatar S3 key in cache with a 600-second TTL.
     * Overwrites any previously pending key for this user.
     *
     * @param userId User UUID.
     * @param avatarKey S3 object key for the pending avatar upload.
     */
    async storePendingAvatar(userId: string, avatarKey: string): Promise<void> {
        await this.redis.set(
            `${USERS_REDIS_KEYS.AVATAR_PENDING_PREFIX}:${userId}`,
            avatarKey,
            600,
        );
    }

    /**
     * Retrieve the pending avatar S3 key from cache.
     *
     * @param userId User UUID.
     * @returns Pending avatar key or null if absent or expired.
     */
    async getPendingAvatar(userId: string): Promise<string | null> {
        return this.redis.get(
            `${USERS_REDIS_KEYS.AVATAR_PENDING_PREFIX}:${userId}`,
        );
    }

    /**
     * Delete the pending avatar cache entry after confirmation or
     * cancellation.
     *
     * @param userId User UUID.
     */
    async deletePendingAvatar(userId: string): Promise<void> {
        await this.redis.del(
            `${USERS_REDIS_KEYS.AVATAR_PENDING_PREFIX}:${userId}`,
        );
    }
}
