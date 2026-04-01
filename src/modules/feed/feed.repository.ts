/**
 * @module modules/feed/feed.repository
 * @description
 * Data-access layer for the Feed module, combining PostgreSQL persistence
 * and Redis cache operations.
 *
 * Owns all DB reads required for candidate generation, scoring, affinity
 * updates, and trending computation. Also owns Redis reads for feed list
 * deduplication and trending sorted set queries.
 *
 * All SQL is raw (no ORM). All numeric config values use parseInt().
 * Redis reads are non-destructive - Feed module never deletes keys it
 * does not own (watched:{userId}, reel_tags:tag:{tagId}).
 */

import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "@database/database.service";
import { RedisService } from "@redis/redis.service";

import {
    AFFINITY_SCORE_MAX,
    AFFINITY_SCORE_MIN,
    FEED_REDIS_KEYS,
    UserExperienceLevel,
} from "./feed.constants";

// ---------------------------------------------------------------------------
// Return type interfaces
// ---------------------------------------------------------------------------

/**
 * User affinity record for a single tag, including the tag's category
 * for round-robin interleaving in FeedBuilderService.
 */
export interface AffinityTag {
    tagId: string;
    score: number;
    category: string;
}

/**
 * Reel scoring data returned by getReelScoringData.
 * Includes aggregated tag IDs and categories from a single joined query.
 */
export interface ReelScoringData extends Record<string, unknown> {
    id: string;
    difficulty: string;
    view_count: number;
    like_count: number;
    save_count: number;
    created_at: string;
    /** Aggregated tag UUIDs from reel_tags join. Empty array if untagged. */
    tag_ids: string[];
    /**
     * Aggregated distinct categories from tags join.
     * Used for round-robin bucket assignment in FeedBuilderService.
     */
    categories: string[];
}

/**
 * Average completion rate for a single reel.
 */
export interface ReelAvgCompletion {
    reelId: string;
    avg_completion: number;
}

/**
 * Reel-tag association pair returned by getReelTagIds.
 * Used by AffinityUpdateWorker to know which tags to update.
 */
export interface ReelTagPair {
    reelId: string;
    tagId: string;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

/**
 * Repository handling all persistence and cache reads for the Feed module.
 */
@Injectable()
export class FeedRepository {
    private readonly logger = new Logger(FeedRepository.name);

    /**
     * @param db PostgreSQL database service.
     * @param redis Redis service for sorted set and list reads.
     */
    constructor(
        private readonly db: DatabaseService,
        private readonly redis: RedisService,
    ) {}

    // -------------------------------------------------------------------------
    // DB - User reads
    // -------------------------------------------------------------------------

    /**
     * Fetch the top N tags by affinity score for a user, including each
     * tag's category. Used by CandidateGeneratorService (Source A) and
     * ReelScorerService to build the user affinity map.
     *
     * @param userId User UUID.
     * @param limit Maximum number of tags to return, ordered by score DESC.
     * @returns Array of AffinityTag objects.
     */
    async getUserAffinityTags(
        userId: string,
        limit: number,
    ): Promise<AffinityTag[]> {
        const result = await this.db.query<{
            tag_id: string;
            score: string;
            category: string;
        }>(
            `SELECT
                uta.tag_id,
                uta.score,
                t.category
            FROM user_topic_affinity uta
            JOIN tags t ON t.id = uta.tag_id
            WHERE uta.user_id = $1
            ORDER BY uta.score DESC
            LIMIT $2`,
            [userId, limit],
        );

        return result.rows.map((row) => ({
            tagId: row.tag_id,
            score: parseFloat(row.score),
            category: row.category,
        }));
    }

    /**
     * Fetch the experience level of a user.
     * Used by CandidateGeneratorService (Source D) and ReelScorerService
     * for difficulty preference multiplier lookup.
     *
     * @param userId User UUID.
     * @returns Experience level string or null if user not found.
     */
    async getUserExperienceLevel(
        userId: string,
    ): Promise<UserExperienceLevel | null> {
        const result = await this.db.query<{
            experience_level: UserExperienceLevel;
        }>(
            `SELECT experience_level
            FROM users
            WHERE id = $1
              AND deleted_at IS NULL`,
            [userId],
        );

        return result.rows[0]?.experience_level ?? null;
    }

    // -------------------------------------------------------------------------
    // DB - Reel reads for scoring
    // -------------------------------------------------------------------------

    /**
     * Fetch scoring data for a batch of reel IDs in a single query.
     * Joins reel_tags and tags to aggregate tag IDs and categories per reel.
     * Only returns active reels - silently excludes non-active IDs.
     *
     * @param reelIds Array of reel UUIDs to fetch scoring data for.
     * @returns Array of ReelScoringData objects.
     */
    async getReelScoringData(reelIds: string[]): Promise<ReelScoringData[]> {
        if (reelIds.length === 0) return [];

        const result = await this.db.query<ReelScoringData>(
            `SELECT
                r.id,
                r.difficulty,
                r.view_count,
                r.like_count,
                r.save_count,
                r.created_at,
                array_agg(rt.tag_id)          AS tag_ids,
                array_agg(DISTINCT t.category) AS categories
            FROM reels r
            LEFT JOIN reel_tags rt ON rt.reel_id = r.id
            LEFT JOIN tags t       ON t.id = rt.tag_id
            WHERE r.id = ANY($1)
              AND r.status = 'active'
              AND r.deleted_at IS NULL
            GROUP BY r.id`,
            [reelIds],
        );

        return result.rows.map((row) => ({
            id: row.id,
            difficulty: row.difficulty,
            view_count: parseInt(String(row.view_count), 10),
            like_count: parseInt(String(row.like_count), 10),
            save_count: parseInt(String(row.save_count), 10),
            created_at: row.created_at,
            // array_agg returns [null] when there are no joined rows - normalise to []
            tag_ids: (row.tag_ids ?? []).filter(Boolean),
            categories: (row.categories ?? []).filter(Boolean),
        }));
    }

    /**
     * Fetch average watch completion rates for a batch of reels.
     * Reels with no watch interactions are absent from the result -
     * callers should default to 0 for missing entries.
     *
     * @param reelIds Array of reel UUIDs.
     * @returns Array of ReelAvgCompletion objects.
     */
    async getAvgCompletionRates(
        reelIds: string[],
    ): Promise<ReelAvgCompletion[]> {
        if (reelIds.length === 0) return [];

        const result = await this.db.query<{
            reel_id: string;
            avg_completion: string;
        }>(
            `SELECT
                reel_id,
                AVG(completion_pct)::text AS avg_completion
            FROM user_reel_interaction
            WHERE reel_id = ANY($1)
              AND interaction_type = 'watch'
              AND completion_pct IS NOT NULL
            GROUP BY reel_id`,
            [reelIds],
        );

        return result.rows.map((row) => ({
            reelId: row.reel_id,
            avg_completion: parseFloat(row.avg_completion),
        }));
    }

    /**
     * Fetch reel-tag associations for a batch of reels.
     * Used by AffinityUpdateWorker to determine which tags to update
     * when a user interacts with a reel.
     *
     * @param reelIds Array of reel UUIDs.
     * @returns Array of ReelTagPair objects.
     */
    async getReelTagIds(reelIds: string[]): Promise<ReelTagPair[]> {
        if (reelIds.length === 0) return [];

        const result = await this.db.query<{
            reel_id: string;
            tag_id: string;
        }>(
            `SELECT reel_id, tag_id
            FROM reel_tags
            WHERE reel_id = ANY($1)`,
            [reelIds],
        );

        return result.rows.map((row) => ({
            reelId: row.reel_id,
            tagId: row.tag_id,
        }));
    }

    // -------------------------------------------------------------------------
    // DB - Candidate generation reads
    // -------------------------------------------------------------------------

    /**
     * Fetch the reel IDs of the last N reels watched by a user.
     * Used by CandidateGeneratorService (Source C) to find reels similar
     * to recently watched content.
     *
     * @param userId User UUID.
     * @param limit Maximum number of recent watch records to return.
     * @returns Array of reel ID strings, most recent first.
     */
    async getRecentlyWatchedReelIds(
        userId: string,
        limit: number,
    ): Promise<string[]> {
        const result = await this.db.query<{ reel_id: string }>(
            `SELECT reel_id
            FROM user_reel_interaction
            WHERE user_id = $1
              AND interaction_type = 'watch'
            ORDER BY created_at DESC
            LIMIT $2`,
            [userId, limit],
        );

        return result.rows.map((row) => row.reel_id);
    }

    /**
     * Fetch distinct tag IDs associated with a batch of reels.
     * Used by CandidateGeneratorService (Source C) to SUNION tag sets
     * for recently watched reels.
     *
     * @param reelIds Array of reel UUIDs.
     * @returns Array of distinct tag ID strings.
     */
    async getTagIdsForReels(reelIds: string[]): Promise<string[]> {
        if (reelIds.length === 0) return [];

        const result = await this.db.query<{ tag_id: string }>(
            `SELECT DISTINCT tag_id
            FROM reel_tags
            WHERE reel_id = ANY($1)`,
            [reelIds],
        );

        return result.rows.map((row) => row.tag_id);
    }

    /**
     * Fetch active reel IDs matching a specific difficulty level,
     * ordered by view_count descending. Used by CandidateGeneratorService
     * (Source D - difficulty matched popular reels).
     *
     * @param difficulty Difficulty level string ('beginner' | 'intermediate' | 'advanced').
     * @param limit Maximum number of reel IDs to return.
     * @returns Array of reel ID strings.
     */
    async getPopularByDifficulty(
        difficulty: string,
        limit: number,
    ): Promise<string[]> {
        const result = await this.db.query<{ id: string }>(
            `SELECT id
            FROM reels
            WHERE difficulty = $1
              AND status = 'active'
              AND deleted_at IS NULL
            ORDER BY view_count DESC
            LIMIT $2`,
            [difficulty, limit],
        );

        return result.rows.map((row) => row.id);
    }

    // -------------------------------------------------------------------------
    // DB - Trending computation
    // -------------------------------------------------------------------------

    /**
     * Fetch the top N most-watched reel IDs in the last 24 hours.
     * Returns reel ID and its 24h view count (used as the sorted set score).
     * Used by TrendingReelsCron to populate trending:reels sorted set.
     *
     * @param limit Maximum number of trending reels to return.
     * @returns Array of { reelId, viewCount } objects ordered by viewCount DESC.
     */
    async getTopTrendingReelIds(
        limit: number,
    ): Promise<{ reelId: string; viewCount: number }[]> {
        const result = await this.db.query<{
            reel_id: string;
            view_count: string;
        }>(
            `SELECT
                uri.reel_id,
                COUNT(*)::text AS view_count
            FROM user_reel_interaction uri
            JOIN reels r ON r.id = uri.reel_id
            WHERE uri.interaction_type = 'watch'
              AND uri.created_at >= now() - interval '24 hours'
              AND r.status = 'active'
              AND r.deleted_at IS NULL
            GROUP BY uri.reel_id
            ORDER BY view_count DESC
            LIMIT $1`,
            [limit],
        );

        return result.rows.map((row) => ({
            reelId: row.reel_id,
            viewCount: parseInt(row.view_count, 10),
        }));
    }

    // -------------------------------------------------------------------------
    // DB - Affinity writes
    // -------------------------------------------------------------------------

    /**
     * Upsert an affinity score delta for a user-tag pair.
     * On insert: initialises score to max(0, min(10, 0 + delta)).
     * On conflict: adds delta to existing score, clamped to [0.0, 10.0].
     * Floor and ceiling are enforced in the DB via GREATEST/LEAST.
     *
     * @param userId User UUID.
     * @param tagId Tag UUID.
     * @param delta Score delta to apply (positive or negative).
     * @returns void
     */
    async upsertAffinityDelta(
        userId: string,
        tagId: string,
        delta: number,
    ): Promise<void> {
        await this.db.query(
            `INSERT INTO user_topic_affinity (user_id, tag_id, score, updated_at)
            VALUES (
                $1,
                $2,
                GREATEST($3, LEAST($4, $5::numeric)),
                now()
            )
            ON CONFLICT (user_id, tag_id) DO UPDATE
            SET
                score      = GREATEST($3, LEAST($4, user_topic_affinity.score + $5::numeric)),
                updated_at = now()`,
            [userId, tagId, AFFINITY_SCORE_MIN, AFFINITY_SCORE_MAX, delta],
        );
    }

    /**
     * Apply a decay multiplier to all affinity scores for all users.
     * Called by AffinityDecayCron on a weekly schedule.
     * Scores are clamped to AFFINITY_SCORE_MIN after multiplication.
     *
     * @param multiplier Decimal multiplier, e.g. 0.95 for 5% weekly decay.
     * @returns Number of rows updated.
     */
    async applyAffinityDecay(multiplier: number): Promise<number> {
        const result = await this.db.query(
            `UPDATE user_topic_affinity
            SET
                score      = GREATEST($1, ROUND(score * $2, 2)),
                updated_at = now()`,
            [AFFINITY_SCORE_MIN, multiplier],
        );

        return result.rowCount ?? 0;
    }

    // -------------------------------------------------------------------------
    // Redis - Feed list reads
    // -------------------------------------------------------------------------

    /**
     * Read all current reel IDs from the user's feed list.
     * Used by FeedBuilderService to exclude already-queued IDs when
     * appending new candidates, preventing duplicates in the feed list.
     * Non-destructive - does not modify the list.
     *
     * @param userId User UUID.
     * @returns Array of reel ID strings currently in the feed list.
     */
    async getExistingFeedIds(userId: string): Promise<string[]> {
        return this.redis.lrange(
            `${FEED_REDIS_KEYS.FEED_PREFIX}:${userId}`,
            0,
            -1,
        );
    }

    /**
     * Append new reel IDs to the right of the user's feed list,
     * then trim to FEED_MAX_LIST_SIZE from the right to prevent unbounded growth.
     * Sets TTL on the list after each write.
     *
     * @param userId User UUID.
     * @param reelIds Ordered array of reel IDs to append.
     * @param maxSize Maximum number of IDs to retain after trim.
     * @param ttl TTL in seconds to set on the list.
     * @returns void
     */
    async appendToFeedList(
        userId: string,
        reelIds: string[],
        maxSize: number,
        ttl: number,
    ): Promise<void> {
        if (reelIds.length === 0) return;

        const key = `${FEED_REDIS_KEYS.FEED_PREFIX}:${userId}`;

        await this.redis.rpush(key, ...reelIds);
        // LTRIM keeps indices -maxSize to -1 (the rightmost maxSize elements).
        // Older items at the left are trimmed away, preventing list growth.
        await this.redis.ltrim(key, -maxSize, -1);
        await this.redis.expire(key, ttl);
    }

    // -------------------------------------------------------------------------
    // Redis - Trending sorted set reads
    // -------------------------------------------------------------------------

    /**
     * Read the top N trending reel IDs from the trending:reels sorted set.
     * Uses ZRANGE ... REV (modern replacement for deprecated ZREVRANGE).
     * Returns empty array if the set is absent (cron hasn't run yet).
     *
     * @param limit Maximum number of trending reel IDs to return.
     * @returns Array of reel ID strings, highest score first.
     */
    async getTrendingReelIds(limit: number): Promise<string[]> {
        try {
            const result = (await this.redis.client.call(
                "ZRANGE",
                FEED_REDIS_KEYS.TRENDING,
                "+inf",
                "-inf",
                "BYSCORE",
                "REV",
                "LIMIT",
                "0",
                String(limit),
            )) as string[];

            return result ?? [];
        } catch (err) {
            this.logger.warn(
                `getTrendingReelIds failed: ${(err as Error).message}`,
            );
            return [];
        }
    }

    /**
     * Rebuild the trending:reels sorted set atomically using a Redis pipeline.
     * Deletes the old set, ZADDs all new entries, then sets TTL.
     * Called exclusively by TrendingReelsCron.
     *
     * @param entries Array of { reelId, score } pairs to write.
     * @param ttl TTL in seconds for the sorted set.
     * @returns void
     */
    async rebuildTrendingSet(
        entries: { reelId: string; score: number }[],
        ttl: number,
    ): Promise<void> {
        if (entries.length === 0) return;

        const pipeline = this.redis.client.pipeline();

        pipeline.del(FEED_REDIS_KEYS.TRENDING);

        for (const { reelId, score } of entries) {
            pipeline.zadd(FEED_REDIS_KEYS.TRENDING, score, reelId);
        }

        pipeline.expire(FEED_REDIS_KEYS.TRENDING, ttl);

        await pipeline.exec();
    }

    // -------------------------------------------------------------------------
    // Redis - Tag set reads (Source A + Source C candidate generation)
    // -------------------------------------------------------------------------

    /**
     * Perform a Redis SUNION across multiple tag sets to get candidate reel IDs.
     * Returns the union of all active reel IDs across the given tag IDs.
     * Falls back to empty array on Redis error - caller handles gracefully.
     *
     * @param tagIds Array of tag UUIDs to union sets for.
     * @returns Array of distinct reel ID strings.
     */
    async getReelIdsByTagUnion(tagIds: string[]): Promise<string[]> {
        if (tagIds.length === 0) return [];

        const keys = tagIds.map(
            (id) => `${FEED_REDIS_KEYS.TAG_SET_PREFIX}:${id}`,
        );

        try {
            return await this.redis.sunion(keys);
        } catch (err) {
            this.logger.warn(
                `getReelIdsByTagUnion SUNION failed: ${(err as Error).message}`,
            );
            return [];
        }
    }
}
