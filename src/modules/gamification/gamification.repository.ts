/**
 * @module modules/gamification/gamification.repository
 * @description
 * Data-access layer for the Gamification module.
 * Combines PostgreSQL persistence (DatabaseService) and Redis cache/sorted-set
 * operations (RedisService).
 *
 * Pattern rules (identical to existing repositories):
 *   - DB methods:    pure SQL - query DB, return domain types or null, no cache ops.
 *   - Cache methods: pure Redis - get/set/del/zadd, no DB calls.
 *   - Service/workers own cache-aside orchestration.
 *
 * Repository methods return domain types or null - never throw AppExceptions.
 * All SQL uses parameterised queries - never string concatenation.
 */

import { Injectable } from "@nestjs/common";
import { DatabaseService } from "@database/database.service";
import { RedisService } from "@redis/redis.service";
import { BaseRepository } from "@database/base.repository";
import {
    InsertXpLedgerData,
    UserStreakRow,
    Badge,
    RecentAttemptRow,
    ChallengeTokenRow,
    ReelTagRow,
} from "./entities/gamification.entity";
import {
    GAMIFICATION_REDIS_KEYS,
    GAMIFICATION_CACHE_TTL,
    TOP_TAGS_CACHE_TTL,
    AFFINITY_WATCH_INCREMENT,
    AFFINITY_MAX_SCORE,
} from "./gamification.constants";
import {
    LEADERBOARD_WEEKLY_KEY_PREFIX,
    TOP_TAGS_KEY_PREFIX,
} from "@common/constants/redis-keys.constants";

/**
 * Repository for all gamification persistence: XP ledger writes, streak
 * updates, badge awards, leaderboard sorted sets, and topic affinity.
 */
@Injectable()
export class GamificationRepository extends BaseRepository {
    constructor(
        db: DatabaseService,
        redis: RedisService,
    ) {
        super(db, redis);
    }

    // =========================================================================
    // DB - XP deduplication check
    // =========================================================================

    /**
     * Checks whether an XP ledger entry already exists for the given
     * user + source + reference combination. Used to prevent double-credit
     * on BullMQ job retries.
     *
     * @param userId      UUID of the user.
     * @param source      XP source string (matches xp_source enum).
     * @param referenceId UUID of the reference entity (challenge or reel).
     * @returns           true if a matching entry already exists.
     */
    async hasXpEntryForReference(
        userId: string,
        source: string,
        referenceId: string,
    ): Promise<boolean> {
        return await this.existsWhere(
            `SELECT EXISTS(
                SELECT 1 FROM xp_ledger
                WHERE user_id      = $1
                  AND source       = $2
                  AND reference_id = $3
             ) AS exists`,
            [userId, source, referenceId],
        );
    }

    // =========================================================================
    // DB - XP ledger write
    // =========================================================================

    /**
     * Inserts a new row into the append-only xp_ledger table.
     * Does NOT update users.total_xp - call updateUserXpAndTokens separately
     * within the same transaction for atomicity.
     *
     * @param data Full ledger entry payload including pre-generated UUID v7 id.
     */
    async insertXpLedgerEntry(data: InsertXpLedgerData): Promise<void> {
        await this.db.query(
            `INSERT INTO xp_ledger
               (id, user_id, delta, source, reference_id, note, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, now())`,
            [
                data.id,
                data.user_id,
                data.delta,
                data.source,
                data.reference_id,
                data.note ?? null,
            ],
        );
    }

    // =========================================================================
    // DB - User XP + token balance update (atomic)
    // =========================================================================

    /**
     * Atomically increments users.total_xp and users.token_balance by the
     * given deltas. Both columns are updated in a single UPDATE statement
     * to prevent partial writes.
     *
     * @param userId     UUID of the user.
     * @param xpDelta    Amount to add to total_xp (always positive in normal flow).
     * @param tokenDelta Amount to add to token_balance (always positive in normal flow).
     */
    async updateUserXpAndTokens(
        userId: string,
        xpDelta: number,
        tokenDelta: number,
    ): Promise<void> {
        await this.db.query(
            `UPDATE users
             SET total_xp      = total_xp      + $2,
                 token_balance = token_balance + $3,
                 updated_at    = now()
             WHERE id = $1`,
            [userId, xpDelta, tokenDelta],
        );
    }

    // =========================================================================
    // DB - Challenge token reward lookup
    // =========================================================================

    /**
     * Fetches token_reward and reel_id for a challenge.
     * Called by XP worker when source = 'challenge_correct' to resolve
     * the token delta and the reel's tag IDs for affinity update.
     *
     * @param challengeId UUID of the challenge.
     * @returns           { token_reward, reel_id } or null if not found.
     */
    async getChallengeTokenReward(
        challengeId: string,
    ): Promise<ChallengeTokenRow | null> {
        return await this.findOne<ChallengeTokenRow>(
            `SELECT token_reward, reel_id
             FROM   challenges
             WHERE  id         = $1
               AND  deleted_at IS NULL`,
            [challengeId],
        );
    }

    // =========================================================================
    // DB - Reel tag lookup (for affinity update)
    // =========================================================================

    /**
     * Fetches all tag IDs associated with a reel.
     * Used to update user_topic_affinity after a watch or challenge event.
     *
     * @param reelId UUID of the reel.
     * @returns      Array of { tag_id } rows (may be empty).
     */
    async getTagsForReel(reelId: string): Promise<ReelTagRow[]> {
        return await this.findMany<ReelTagRow>(
            `SELECT tag_id FROM reel_tags WHERE reel_id = $1`,
            [reelId],
        );
    }

    // =========================================================================
    // DB - Topic affinity update
    // =========================================================================

    /**
     * Increments the affinity score for a user+tag pair by the watch
     * increment constant, capped at AFFINITY_MAX_SCORE.
     * Idempotent via ON CONFLICT DO UPDATE.
     *
     * @param userId UUID of the user.
     * @param tagId  UUID of the tag.
     */
    async incrementTopicAffinity(userId: string, tagId: string): Promise<void> {
        await this.db.query(
            `INSERT INTO user_topic_affinity (user_id, tag_id, score, updated_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (user_id, tag_id)
             DO UPDATE SET
                 score      = LEAST(
                                  user_topic_affinity.score + $3,
                                  $4
                              ),
                 updated_at = now()`,
            [userId, tagId, AFFINITY_WATCH_INCREMENT, AFFINITY_MAX_SCORE],
        );
    }

    /**
     * Fetches the top N tag IDs for a user ordered by affinity score DESC.
     * Used to refresh the top_tags:{userId} cache after an affinity update.
     *
     * @param userId UUID of the user.
     * @param limit  Number of top tags to return.
     * @returns      Array of tag UUID strings.
     */
    async getTopTagIds(userId: string, limit: number): Promise<string[]> {
        const rows = await this.findMany<{ tag_id: string }>(
            `SELECT tag_id
             FROM   user_topic_affinity
             WHERE  user_id = $1
             ORDER  BY score DESC
             LIMIT  $2`,
            [userId, limit],
        );
        return rows.map((r) => r.tag_id);
    }

    // =========================================================================
    // DB - Streak reads
    // =========================================================================

    /**
     * Fetches streak-relevant columns for a single user.
     *
     * @param userId UUID of the user.
     * @returns      UserStreakRow or null if user not found.
     */
    async getUserStreakRow(userId: string): Promise<UserStreakRow | null> {
        return await this.findOne<UserStreakRow>(
            `SELECT id, current_streak, longest_streak,
                    last_active_date::text, streak_freeze_until::text
             FROM   users
             WHERE  id         = $1
               AND  deleted_at IS NULL`,
            [userId],
        );
    }

    /**
     * Fetches a batch of users whose last_active_date needs streak evaluation.
     * Called by the daily streak reset worker.
     *
     * Returns users where last_active_date < today (i.e. did not watch today)
     * and current_streak > 0 (streak is active, worth evaluating).
     * Excludes users already frozen until a future date.
     *
     * @param todayUtc ISO date string for today in UTC e.g. '2025-03-15'.
     * @param limit    Batch size.
     * @param offset   Pagination offset.
     * @returns        Array of UserStreakRow.
     */
    async getUsersForStreakEvaluation(
        todayUtc: string,
        limit: number,
        offset: number,
    ): Promise<UserStreakRow[]> {
        return await this.findMany<UserStreakRow>(
            `SELECT id, current_streak, longest_streak,
                    last_active_date::text, streak_freeze_until::text
             FROM   users
             WHERE  deleted_at       IS NULL
               AND  current_streak   > 0
               AND  last_active_date IS NOT NULL
               AND  last_active_date < $1::date
             ORDER  BY id
             LIMIT  $2
             OFFSET $3`,
            [todayUtc, limit, offset],
        );
    }

    // =========================================================================
    // DB - Streak writes
    // =========================================================================

    /**
     * Increments current_streak by 1, updates last_active_date to today,
     * and updates longest_streak if the new streak exceeds it.
     * Called when a user watches a reel on a new day.
     *
     * @param userId   UUID of the user.
     * @param todayUtc ISO date string for today in UTC.
     */
    async incrementStreak(userId: string, todayUtc: string): Promise<void> {
        await this.db.query(
            `UPDATE users
             SET current_streak   = current_streak + 1,
                 longest_streak   = GREATEST(longest_streak, current_streak + 1),
                 last_active_date = $2::date,
                 streak_freeze_until = NULL,
                 updated_at       = now()
             WHERE id = $1`,
            [userId, todayUtc],
        );
    }

    /**
     * Updates last_active_date to today without changing the streak count.
     * Called when a user watches a reel on the same day as last_active_date
     * (streak already counted today).
     *
     * @param userId   UUID of the user.
     * @param todayUtc ISO date string for today in UTC.
     */
    async touchLastActiveDate(userId: string, todayUtc: string): Promise<void> {
        await this.db.query(
            `UPDATE users
             SET last_active_date = $2::date,
                 updated_at       = now()
             WHERE id = $1`,
            [userId, todayUtc],
        );
    }

    /**
     * Activates a streak freeze for the user by setting streak_freeze_until
     * to the given date. Called when a user misses exactly one day.
     *
     * @param userId         UUID of the user.
     * @param freezeUntilUtc ISO date string (tomorrow in UTC).
     */
    async setStreakFreeze(
        userId: string,
        freezeUntilUtc: string,
    ): Promise<void> {
        await this.db.query(
            `UPDATE users
             SET streak_freeze_until = $2::date,
                 updated_at          = now()
             WHERE id = $1`,
            [userId, freezeUntilUtc],
        );
    }

    /**
     * Resets the user's streak to 0 and clears all streak-related fields.
     * Called when the grace period has expired.
     *
     * @param userId UUID of the user.
     */
    async resetStreak(userId: string): Promise<void> {
        await this.db.query(
            `UPDATE users
             SET current_streak      = 0,
                 streak_freeze_until = NULL,
                 updated_at          = now()
             WHERE id = $1`,
            [userId],
        );
    }

    // =========================================================================
    // DB - Badge reads
    // =========================================================================

    /**
     * Fetches all active badges whose criteria.event_trigger matches
     * the given event string. The worker evaluates only relevant badges
     * per event to avoid scanning the full badge catalogue every time.
     *
     * @param eventTrigger Event string e.g. 'challenge_correct'.
     * @returns            Array of active Badge rows.
     */
    async getActiveBadgesForEvent(eventTrigger: string): Promise<Badge[]> {
        return await this.findMany<Badge>(
            `SELECT id, code, name, description, icon_url, criteria,
                    is_active, created_at, updated_at
             FROM   badges
             WHERE  is_active                          = true
               AND  criteria->>'event_trigger'         = $1`,
            [eventTrigger],
        );
    }

    /**
     * Checks whether a user already holds a specific badge.
     * Used as a gate before awarding to prevent duplicates.
     *
     * @param userId  UUID of the user.
     * @param badgeId UUID of the badge.
     * @returns       true if the user already has this badge.
     */
    async userHasBadge(userId: string, badgeId: string): Promise<boolean> {
        return await this.existsWhere(
            `SELECT EXISTS(SELECT 1 FROM user_badges WHERE user_id = $1 AND badge_id = $2) AS exists`,
            [userId, badgeId],
        );
    }

    /**
     * Returns the total number of correct challenge answers for a user.
     * Used by challenge_correct_count criteria evaluator.
     *
     * @param userId UUID of the user.
     * @returns      Count of correct attempts.
     */
    async getTotalCorrectCount(userId: string): Promise<number> {
        const row = await this.findOne<{ count: string }>(
            `SELECT COUNT(*) AS count
             FROM   challenges_attempts
             WHERE  user_id    = $1
               AND  is_correct = true`,
            [userId],
        );
        return this.parseCount(row?.count);
    }

    /**
     * Returns recent challenge attempts for a user ordered oldest-first.
     * Used by accuracy_streak criteria evaluator.
     * Fetches only the minimum required to evaluate the highest threshold badge.
     *
     * @param userId UUID of the user.
     * @param limit  Number of most-recent attempts to fetch.
     * @returns      Array of { is_correct, attempted_at }.
     */
    async getRecentAttempts(
        userId: string,
        limit: number,
    ): Promise<RecentAttemptRow[]> {
        const rows = await this.findMany<RecentAttemptRow>(
            `SELECT is_correct, attempted_at
             FROM   challenges_attempts
             WHERE  user_id = $1
             ORDER  BY attempted_at DESC
             LIMIT  $2`,
            [userId, limit],
        );
        // Reverse to oldest-first for streak counting
        return rows.reverse();
    }

    // =========================================================================
    // DB - Badge write
    // =========================================================================

    /**
     * Inserts a row into user_badges to record badge award.
     * Caller must check userHasBadge before calling this method.
     * Uses ON CONFLICT DO NOTHING as a final safety net against race conditions
     * (primary safety is the distributed lock in the service layer).
     *
     * @param id      Pre-generated UUID v7 for the user_badges row.
     * @param userId  UUID of the user.
     * @param badgeId UUID of the badge.
     */
    async awardBadge(
        id: string,
        userId: string,
        badgeId: string,
    ): Promise<void> {
        await this.db.query(
            `INSERT INTO user_badges (id, user_id, badge_id, earned_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (user_id, badge_id) DO NOTHING`,
            [id, userId, badgeId],
        );
    }

    // =========================================================================
    // Cache - XP deduplication sentinel
    // =========================================================================

    /**
     * Checks whether the XP deduplication sentinel key exists for a given
     * user + source + referenceId combination.
     * Redis-layer fast path - checked before the DB query in the worker.
     *
     * @param userId      UUID of the user.
     * @param source      XP source string.
     * @param referenceId UUID of the reference entity.
     * @returns           true if sentinel exists (XP already awarded).
     */
    async hasXpDedupSentinel(
        userId: string,
        source: string,
        referenceId: string,
    ): Promise<boolean> {
        return this.redis.exists(
            `${GAMIFICATION_REDIS_KEYS.XP_DEDUP}:${userId}:${source}:${referenceId}`,
        );
    }

    /**
     * Sets the XP deduplication sentinel key with a 7-day TTL.
     * Called immediately after a successful xp_ledger insert.
     *
     * @param userId      UUID of the user.
     * @param source      XP source string.
     * @param referenceId UUID of the reference entity.
     */
    async setXpDedupSentinel(
        userId: string,
        source: string,
        referenceId: string,
    ): Promise<void> {
        await this.redis.set(
            `${GAMIFICATION_REDIS_KEYS.XP_DEDUP}:${userId}:${source}:${referenceId}`,
            "1",
            GAMIFICATION_CACHE_TTL.XP_DEDUP,
        );
    }

    // =========================================================================
    // Cache - Badge award distributed lock
    // =========================================================================

    /**
     * Attempts to acquire a distributed lock for badge award.
     * Uses SET NX (set if not exists) with a short TTL to prevent concurrent
     * award race conditions in multi-pod deployments.
     *
     * @param userId    UUID of the user.
     * @param badgeCode Badge code string.
     * @returns         true if the lock was acquired, false if already held.
     */
    async acquireBadgeAwardLock(
        userId: string,
        badgeCode: string,
    ): Promise<boolean> {
        return this.redis.setNx(
            `${GAMIFICATION_REDIS_KEYS.BADGE_AWARD_LOCK}:${userId}:${badgeCode}`,
            "1",
            GAMIFICATION_CACHE_TTL.BADGE_AWARD_LOCK,
        );
    }

    /**
     * Releases the badge award distributed lock.
     * Always called in a finally block after award attempt completes.
     *
     * @param userId    UUID of the user.
     * @param badgeCode Badge code string.
     */
    async releaseBadgeAwardLock(
        userId: string,
        badgeCode: string,
    ): Promise<void> {
        await this.redis.del(
            `${GAMIFICATION_REDIS_KEYS.BADGE_AWARD_LOCK}:${userId}:${badgeCode}`,
        );
    }

    // =========================================================================
    // Cache - Leaderboard sorted sets
    // =========================================================================

    /**
     * Increments a user's score on the weekly leaderboard sorted set for a
     * given tag. Creates the key if it does not exist.
     *
     * Full key: leaderboard:weekly:{tagId}
     *
     * @param tagId  UUID of the tag.
     * @param userId UUID of the user (sorted set member).
     * @param xp     Amount to increment the score by.
     */
    async incrementLeaderboardScore(
        tagId: string,
        userId: string,
        xp: number,
    ): Promise<void> {
        await this.redis.zincrby(
            `${LEADERBOARD_WEEKLY_KEY_PREFIX}:${tagId}`,
            xp,
            userId,
        );
    }

    /**
     * Deletes all weekly leaderboard sorted set keys matching the pattern
     * leaderboard:weekly:*.
     * Called by the weekly leaderboard reset worker every Monday 00:00 UTC.
     */
    async resetWeeklyLeaderboard(): Promise<void> {
        await this.redis.deletePattern(`${LEADERBOARD_WEEKLY_KEY_PREFIX}:*`);
    }

    // =========================================================================
    // Cache - Top tags per user
    // =========================================================================

    /**
     * Refreshes the top_tags:{userId} cache key with the user's current
     * top N tag IDs ordered by affinity score DESC.
     * Called after every affinity increment so leaderboard rank reads
     * use fresh data.
     *
     * @param userId UUID of the user.
     * @param tagIds Ordered array of top tag UUID strings.
     */
    async setTopTagsCache(userId: string, tagIds: string[]): Promise<void> {
        await this.cacheSet(
            `${TOP_TAGS_KEY_PREFIX}:${userId}`,
            tagIds,
            TOP_TAGS_CACHE_TTL,
        );
    }
}
