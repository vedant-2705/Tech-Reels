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
import { BaseRepository } from "@database/base.repository";
import { User } from "@modules/auth/entities/user.entity";
import { USERS_CACHE_TTL_SECONDS, USERS_REDIS_KEYS } from "./users.constants";

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
export class UsersRepository extends BaseRepository {
    constructor(
        db: DatabaseService,
        redis: RedisService,
    ) {
        super(db, redis);
    }

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
        return await this.findOne<User>(
            `SELECT
                id, email, username, avatar_url, bio, role, experience_level,
                account_status, total_xp, token_balance, current_streak,
                longest_streak, last_active_date, public_profile_token,
                password_hash, token_version, created_at
             FROM users
             WHERE id = $1 AND deleted_at IS NULL`,
            [userId],
        );
    }

    /**
     * Fetch a non-deleted user by username with public-safe fields.
     *
     * @param username Username to look up.
     * @returns Matching user or null.
     */
    async findByUsername(username: string): Promise<User | null> {
        return await this.findOne<User>(
            `SELECT
                id, username, avatar_url, bio, experience_level, total_xp,
                current_streak, longest_streak, account_status, created_at
             FROM users
             WHERE username = $1 AND deleted_at IS NULL`,
            [username],
        );
    }

    /**
     * Fetch a non-deleted user by their public profile token.
     *
     * @param token 64-char hex public profile token.
     * @returns Matching user or null.
     */
    async findByPublicProfileToken(token: string): Promise<User | null> {
        return await this.findOne<User>(
            `SELECT
                id, username, avatar_url, bio, experience_level, total_xp,
                current_streak, longest_streak, account_status, created_at
             FROM users
             WHERE public_profile_token = $1 AND deleted_at IS NULL`,
            [token],
        );
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
        return await this.existsWhere(
            `SELECT EXISTS(SELECT 1 FROM users WHERE username = $1 AND deleted_at IS NULL) AS exists`,
            [username],
        );
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
        return await this.existsWhere(
            `SELECT EXISTS(SELECT 1 FROM users WHERE username = $1 AND id != $2 AND deleted_at IS NULL) AS exists`,
            [username, excludeUserId],
        );
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
     * Upsert topic affinity rows for the given tag IDs in a single multi-row
     * statement. Safe to call multiple times - idempotent via ON CONFLICT DO UPDATE.
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
        if (!tagIds.length) return;
        // Single multi-row upsert - avoids N individual round-trips
        const values = tagIds
            .map((_, i) => `($1, $${i + 2}, $${tagIds.length + 2}, now())`)
            .join(", ");
        await this.db.query(
            `INSERT INTO user_topic_affinity (user_id, tag_id, score, updated_at)
             VALUES ${values}
             ON CONFLICT (user_id, tag_id)
             DO UPDATE SET score = EXCLUDED.score, updated_at = now()`,
            [userId, ...tagIds, score],
        );
    }

    /**
     * Returns only the IDs that actually exist in the tags table.
     *
     * @param tagIds Candidate tag UUIDs to validate.
     * @returns Subset of tagIds that exist in persistence.
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
        const rows = await this.findMany<{ provider: string }>(
            `SELECT provider FROM oauth_accounts WHERE user_id = $1`,
            [userId],
        );
        return rows.map((r) => r.provider);
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
        return await this.findMany<XpLedgerEntry>(
            `SELECT id, delta, source, reference_id, note, created_at
             FROM xp_ledger
             WHERE user_id = $1
               AND ($2::uuid IS NULL OR created_at < (SELECT created_at FROM xp_ledger WHERE id = $2))
             ORDER BY created_at DESC
             LIMIT $3`,
            [userId, cursor, limit],
        );
    }

    /**
     * Read the current total_xp value from the users table.
     *
     * @param userId User UUID.
     * @returns Total XP integer.
     */
    async getTotalXp(userId: string): Promise<number> {
        const row = await this.findOne<{ total_xp: number }>(
            `SELECT total_xp FROM users WHERE id = $1`,
            [userId],
        );
        return row?.total_xp ?? 0;
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
        return await this.findMany<BadgeEntry>(
            `SELECT b.id, b.code, b.name, b.description, b.icon_url, ub.earned_at
             FROM user_badges ub
             JOIN badges b ON b.id = ub.badge_id
             WHERE ub.user_id = $1
             ORDER BY ub.earned_at DESC`,
            [userId],
        );
    }

    /**
     * Count total badges earned by a user.
     *
     * @param userId User UUID.
     * @returns Badge count.
     */
    async getBadgeCount(userId: string): Promise<number> {
        const row = await this.findOne<{ count: string }>(
            `SELECT COUNT(*) AS count FROM user_badges WHERE user_id = $1`,
            [userId],
        );
        return this.parseCount(row?.count);
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
        const row = await this.findOne<{ count: string }>(
            `SELECT COUNT(*) AS count
             FROM user_reel_interaction
             WHERE user_id = $1 AND interaction_type = 'watch'`,
            [userId],
        );
        return this.parseCount(row?.count);
    }

    /**
     * Aggregate challenge attempt statistics for a user.
     * NOTE: table is challenges_attempts (plural with s).
     *
     * @param userId User UUID.
     * @returns Total attempted, total correct, and accuracy rate.
     */
    async getChallengeStats(userId: string): Promise<ChallengeStats> {
        const row = await this.findOne<{
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

        const total_attempted = this.parseCount(row?.total_attempted);
        const total_correct = this.parseCount(row?.total_correct);
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
        const row = await this.findOne<{ count: string }>(
            `SELECT COUNT(*) AS count
             FROM user_skill_paths
             WHERE user_id = $1 AND status = 'completed'`,
            [userId],
        );
        return this.parseCount(row?.count);
    }

    /**
     * Count active published reels created by a user.
     *
     * @param userId User UUID.
     * @returns Active reel count.
     */
    async getReelsCount(userId: string): Promise<number> {
        const row = await this.findOne<{ count: string }>(
            `SELECT COUNT(*) AS count
             FROM reels
             WHERE creator_id = $1 AND status = 'active' AND deleted_at IS NULL`,
            [userId],
        );
        return this.parseCount(row?.count);
    }

    /**
     * Resolve the user's top affinity tag ID. Reads from top_tags:{userId}
     * cache first. On cache miss, falls back to user_topic_affinity table,
     * then re-caches the result for 1 hour.
     *
     * @param userId User UUID.
     * @returns Top tag ID string, or null if the user has no affinity data.
     */
    async getTopTagId(userId: string): Promise<string | null> {
        // 1. Try cache first
        const cachedTagIds = await this.cacheGet<string[]>(
            `${USERS_REDIS_KEYS.TOP_TAGS_PREFIX}:${userId}`,
        );

        if (cachedTagIds) {
            return cachedTagIds[0] ?? null;
        }

        // 2. Cache miss - fall back to DB
        const rows = await this.findMany<{ tag_id: string }>(
            `SELECT tag_id
            FROM user_topic_affinity
            WHERE user_id = $1
            ORDER BY score DESC
            LIMIT 5`,
            [userId],
        );

        if (!rows.length) return null;

        const tagIds = rows.map((r) => r.tag_id);

        // 3. Re-populate cache so next call is fast
        await this.cacheSet<string[]>(
            `${USERS_REDIS_KEYS.TOP_TAGS_PREFIX}:${userId}`,
            tagIds,
            USERS_CACHE_TTL_SECONDS.TOP_TAGS_TTL,
        );

        return tagIds[0];
    }

    /**
     * Resolve the user's weekly leaderboard rank for a given tag.
     * Returns 0-based rank from Redis ZREVRANK, or null if not ranked.
     *
     * @param userId User UUID.
     * @param tagId Tag UUID to look up rank for.
     * @returns 0-based rank integer, or null if not on leaderboard.
     */
    async getLeaderboardRank(
        userId: string,
        tagId: string,
    ): Promise<number | null> {
        const rank = await this.redis.zrevrank(
            `${USERS_REDIS_KEYS.LEADERBOARD_PREFIX}:${tagId}`,
            userId,
        );
        return rank ?? null;
    }

    /**
     * Fetch the top N entries from the weekly leaderboard for a tag.
     * Returns member + score pairs ordered by score DESC.
     * ZRANGE with REV and WITHSCORES - members are userIds.
     *
     * @param tagId Tag UUID.
     * @param limit Number of top entries to return.
     * @returns Array of { userId, score } pairs.
     */
    async getLeaderboardTopEntries(
        tagId: string,
        limit: number,
    ): Promise<{ userId: string; score: number }[]> {
        // returns [member, score, member, score, ...]
        const raw = await this.redis.zrangeRevWithScores(
            `${USERS_REDIS_KEYS.LEADERBOARD_PREFIX}:${tagId}`,
            limit - 1,
        );

        // raw is alternating [userId, score, userId, score, ...]
        const entries: { userId: string; score: number }[] = [];
        for (let i = 0; i < raw.length; i += 2) {
            entries.push({
                userId: raw[i],
                score: parseFloat(raw[i + 1]),
            });
        }
        return entries;
    }

    /**
     * Get the total number of members on a leaderboard.
     *
     * @param tagId Tag UUID.
     * @returns Member count.
     */
    async getLeaderboardSize(tagId: string): Promise<number> {
        return this.redis.zcard(
            `${USERS_REDIS_KEYS.LEADERBOARD_PREFIX}:${tagId}`,
        );
    }

    /**
     * Get the weekly XP score for a specific user on a tag leaderboard.
     *
     * @param tagId Tag UUID.
     * @param userId User UUID.
     * @returns Score as number, or null if not on leaderboard.
     */
    async getLeaderboardUserScore(
        tagId: string,
        userId: string,
    ): Promise<number | null> {
        const score = await this.redis.zscore(
            `${USERS_REDIS_KEYS.LEADERBOARD_PREFIX}:${tagId}`,
            userId,
        );
        return score !== null ? parseFloat(score) : null;
    }

    /**
     * Fetch usernames for a list of user IDs in a single query.
     *
     * @param userIds Array of user UUIDs.
     * @returns Map of userId -> username.
     */
    async getUsernamesByIds(userIds: string[]): Promise<Map<string, string>> {
        if (!userIds.length) return new Map();

        const rows = await this.findMany<{ id: string; username: string }>(
            `SELECT id, username
         FROM users
         WHERE id = ANY($1) AND deleted_at IS NULL`,
            [userIds],
        );

        return new Map(rows.map((r) => [r.id, r.username]));
    }

    /**
     * Fetch the tag name for a given tag ID.
     *
     * @param tagId Tag UUID.
     * @returns Tag name string, or null if not found.
     */
    async getTagName(tagId: string): Promise<string | null> {
        const row = await this.findOne<{ name: string }>(
            `SELECT name FROM tags WHERE id = $1`,
            [tagId],
        );
        return row?.name ?? null;
    }

    /**
     * Fetch the top 5 topic affinities for a user, ordered by score DESC.
     *
     * @param userId User UUID.
     * @returns Array of tag name + score pairs.
     */
    async getTopTopics(userId: string): Promise<TopTopic[]> {
        return await this.findMany<TopTopic>(
            `SELECT t.name AS tag_name, uta.score
             FROM user_topic_affinity uta
             JOIN tags t ON t.id = uta.tag_id
             WHERE uta.user_id = $1
             ORDER BY uta.score DESC
             LIMIT 5`,
            [userId],
        );
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
        // NOTE: avatarKey is a plain string, not JSON - use redis.set directly
        // (cacheSet wraps with JSON.stringify which would double-encode the string)
        await this.redis.set(
            `${USERS_REDIS_KEYS.AVATAR_PENDING_PREFIX}:${userId}`,
            avatarKey,
            USERS_CACHE_TTL_SECONDS.PENDING_AVATAR,
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
