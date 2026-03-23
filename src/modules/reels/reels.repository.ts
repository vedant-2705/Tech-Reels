/**
 * @module modules/reels/reels.repository
 * @description
 * Data-access layer for the Reels module, combining PostgreSQL persistence
 * and Redis cache/Bloom-filter/Set/List operations.
 *
 * All SQL is raw (no ORM). All numeric config values use parseInt().
 * Bloom filter (BF.*) calls are wrapped in try/catch for graceful
 * degradation when redis-stack is unavailable.
 */

import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "@database/database.service";
import { RedisService } from "@redis/redis.service";
import { uuidv7 } from "@common/utils/uuidv7.util";

import {
    Reel,
    ReelMeta,
    ReelStatusUpdate,
    ReelTag,
} from "./entities/reel.entity";
import {
    REELS_CACHE_TTL,
    REELS_REDIS_KEYS,
    ReelStatus,
    ReelDifficulty,
    REEL_STATUS,
} from "./reels.constants";

/** Shape passed to repository create method. */
interface CreateReelData {
    creatorId: string;
    title: string;
    description?: string;
    difficulty: ReelDifficulty;
}

/** Shape passed to repository update method. */
interface UpdateReelData {
    title?: string;
    description?: string;
    difficulty?: ReelDifficulty;
}

/** Shape passed to setProcessingResult (called by Media module via ReelsProcessingService). */
export interface ProcessingResultData {
    status: ReelStatus;
    hls_path: string | null;
    thumbnail_key: string | null;
    duration_seconds: number | null;
}

/**
 * Repository handling all persistence and cache operations for the Reels module.
 */
@Injectable()
export class ReelsRepository {
    private readonly logger = new Logger(ReelsRepository.name);

    /**
     * @param db PostgreSQL database service.
     * @param redis Redis service for cache, Bloom filter, Sets, and Lists.
     */
    constructor(
        private readonly db: DatabaseService,
        private readonly redis: RedisService,
    ) {}

    // DB - Read methods

    /**
     * Fetch a single reel by ID, joined with creator info and aggregated tags.
     * Returns null if the reel is soft-deleted.
     *
     * @param id Reel UUID.
     * @returns Reel entity or null.
     */
    async findById(id: string): Promise<Reel | null> {
        const result = await this.db.query<Reel>(
            `SELECT
         r.*,
         u.username,
         u.avatar_url,
         COALESCE(
           json_agg(
             json_build_object('id', t.id, 'name', t.name, 'category', t.category)
           ) FILTER (WHERE t.id IS NOT NULL),
           '[]'
         ) AS tags
       FROM reels r
       JOIN users u ON u.id = r.creator_id
       LEFT JOIN reel_tags rt ON rt.reel_id = r.id
       LEFT JOIN tags t ON t.id = rt.tag_id
       WHERE r.id = $1 AND r.deleted_at IS NULL
       GROUP BY r.id, u.username, u.avatar_url`,
            [id],
        );
        return result.rows[0] ?? null;
    }

    /**
     * Fetch a paginated list of reels for a specific creator.
     * Returns all statuses (uploading, processing, active, failed, etc.).
     * Supports optional status filter and keyset pagination by reel id.
     *
     * @param userId Creator user UUID.
     * @param limit Maximum number of results.
     * @param cursor Optional UUID v7 cursor (exclusive - returns reels created before this id).
     * @param status Optional status filter.
     * @returns Array of Reel entities.
     */
    async findByCreator(
        userId: string,
        limit: number,
        cursor?: string,
        status?: ReelStatus,
    ): Promise<Reel[]> {
        const params: unknown[] = [userId, limit + 1];
        const conditions: string[] = [
            "r.creator_id = $1",
            "r.deleted_at IS NULL",
        ];

        if (cursor) {
            params.push(cursor);
            conditions.push(`r.id < $${params.length}`);
        }

        if (status) {
            params.push(status);
            conditions.push(`r.status = $${params.length}`);
        }

        const result = await this.db.query<Reel>(
            `SELECT
         r.*,
         u.username,
         u.avatar_url,
         COALESCE(
           json_agg(
             json_build_object('id', t.id, 'name', t.name, 'category', t.category)
           ) FILTER (WHERE t.id IS NOT NULL),
           '[]'
         ) AS tags
       FROM reels r
       JOIN users u ON u.id = r.creator_id
       LEFT JOIN reel_tags rt ON rt.reel_id = r.id
       LEFT JOIN tags t ON t.id = rt.tag_id
       WHERE ${conditions.join(" AND ")}
       GROUP BY r.id, u.username, u.avatar_url
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT $2`,
            params,
        );
        return result.rows;
    }

    /**
     * Fetch active reels ordered by recency - used as cold-start feed fallback.
     *
     * @param limit Maximum number of results.
     * @param cursor Optional UUID v7 cursor for pagination.
     * @returns Array of active Reel entities.
     */
    async findActive(limit: number, cursor?: string): Promise<Reel[]> {
        const params: unknown[] = [limit];
        const conditions: string[] = [
            `r.status = ${REEL_STATUS.ACTIVE}`,
            "r.deleted_at IS NULL",
        ];

        if (cursor) {
            params.push(cursor);
            conditions.push(`r.id < $${params.length}`);
        }

        const result = await this.db.query<Reel>(
            `SELECT
         r.*,
         u.username,
         u.avatar_url,
         COALESCE(
           json_agg(
             json_build_object('id', t.id, 'name', t.name, 'category', t.category)
           ) FILTER (WHERE t.id IS NOT NULL),
           '[]'
         ) AS tags
       FROM reels r
       JOIN users u ON u.id = r.creator_id
       LEFT JOIN reel_tags rt ON rt.reel_id = r.id
       LEFT JOIN tags t ON t.id = rt.tag_id
       WHERE ${conditions.join(" AND ")}
       GROUP BY r.id, u.username, u.avatar_url
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT $1`,
            params,
        );
        return result.rows;
    }

    /**
     * Admin: paginated list of all reels with optional filters.
     *
     * @param limit Maximum results.
     * @param cursor Optional UUID cursor.
     * @param status Optional status filter.
     * @param creatorId Optional creator filter.
     * @returns Array of Reel entities.
     */
    async findAllAdmin(
        limit: number,
        cursor?: string,
        status?: ReelStatus,
        creatorId?: string,
    ): Promise<Reel[]> {
        const params: unknown[] = [limit + 1];
        const conditions: string[] = [];

        if (cursor) {
            params.push(cursor);
            conditions.push(`r.id < $${params.length}`);
        }

        if (status) {
            params.push(status);
            conditions.push(`r.status = $${params.length}`);
        }

        if (creatorId) {
            params.push(creatorId);
            conditions.push(`r.creator_id = $${params.length}`);
        }

        const result = await this.db.query<Reel>(
            `SELECT
         r.*,
         u.username,
         u.avatar_url,
         COALESCE(
           json_agg(
             json_build_object('id', t.id, 'name', t.name, 'category', t.category)
           ) FILTER (WHERE t.id IS NOT NULL),
           '[]'
         ) AS tags
       FROM reels r
       JOIN users u ON u.id = r.creator_id
       LEFT JOIN reel_tags rt ON rt.reel_id = r.id
       LEFT JOIN tags t ON t.id = rt.tag_id
       WHERE ${conditions.join(" AND ")}
       GROUP BY r.id, u.username, u.avatar_url
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT $1`,
            params,
        );
        return result.rows;
    }

    /**
     * Validate that all provided tag UUIDs exist in the tags table.
     *
     * @param tagIds Candidate tag UUIDs.
     * @returns Array of matching tag IDs that actually exist.
     */
    async validateTagIds(tagIds: string[]): Promise<string[]> {
        const result = await this.db.query<{ id: string }>(
            `SELECT id FROM tags WHERE id = ANY($1)`,
            [tagIds],
        );
        return result.rows.map((r) => r.id);
    }

    /**
     * Fetch tags associated with a reel from the DB.
     * Used by ReelsProcessingService (Media module integration).
     *
     * @param reelId Reel UUID.
     * @returns Array of tag objects.
     */
    async getTagsForReel(reelId: string): Promise<ReelTag[]> {
        const result = await this.db.query<ReelTag>(
            `SELECT t.id, t.name, t.category
       FROM tags t
       JOIN reel_tags rt ON rt.tag_id = t.id
       WHERE rt.reel_id = $1`,
            [reelId],
        );
        return result.rows;
    }

    // DB - Write methods

    /**
     * Insert a new reel row with status=uploading.
     *
     * @param data Reel creation payload.
     * @returns Newly created Reel entity (without joined fields - creator/tags must be fetched separately).
     */
    async create(data: CreateReelData): Promise<Reel> {
        const id = uuidv7();
        const now = new Date().toISOString();

        const result = await this.db.query<Reel>(
            `INSERT INTO reels (
         id, creator_id, title, description, difficulty,
         status, view_count, like_count, save_count, share_count,
         created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         'uploading', 0, 0, 0, 0,
         $6, $6
       ) RETURNING *`,
            [
                id,
                data.creatorId,
                data.title,
                data.description ?? null,
                data.difficulty,
                now,
            ],
        );

        return result.rows[0];
    }

    /**
     * Update mutable reel fields (title, description, difficulty).
     * Uses COALESCE so only provided fields are changed.
     *
     * @param id Reel UUID.
     * @param data Partial update payload.
     * @returns Updated Reel entity (without joins - caller must re-fetch if needed).
     */
    async update(id: string, data: UpdateReelData): Promise<Reel> {
        const result = await this.db.query<Reel>(
            `UPDATE reels
       SET title       = COALESCE($2, title),
           description = COALESCE($3, description),
           difficulty  = COALESCE($4, difficulty),
           updated_at  = now()
       WHERE id = $1
       RETURNING *`,
            [
                id,
                data.title ?? null,
                data.description ?? null,
                data.difficulty ?? null,
            ],
        );
        return result.rows[0];
    }

    /**
     * Update reel status only (used by admin endpoint).
     *
     * @param id Reel UUID.
     * @param status New status value.
     * @returns Minimal status update shape.
     */
    async updateStatus(
        id: string,
        status: ReelStatus,
    ): Promise<ReelStatusUpdate> {
        const result = await this.db.query<ReelStatusUpdate>(
            `UPDATE reels
       SET status = $2, updated_at = now()
       WHERE id = $1
       RETURNING id, status, updated_at`,
            [id, status],
        );
        return result.rows[0];
    }

    /**
     * Move a reel to processing status and clear the pending cache key.
     * Called during POST /reels/:id/confirm.
     *
     * @param id Reel UUID.
     */
    async setProcessing(id: string): Promise<void> {
        await this.db.query(
            `UPDATE reels SET status = ${REEL_STATUS.PROCESSING}, updated_at = now() WHERE id = $1`,
            [id],
        );
    }

    /**
     * Soft-delete a reel: set status=deleted and record deleted_at timestamp.
     *
     * @param id Reel UUID.
     */
    async softDelete(id: string): Promise<void> {
        await this.db.query(
            `UPDATE reels
       SET status = ${REEL_STATUS.DELETED}, deleted_at = now(), updated_at = now()
       WHERE id = $1`,
            [id],
        );
    }

    /**
     * Update reel fields after MediaConvert processing completes or fails.
     * Called by ReelsProcessingService (consumed by Media module).
     *
     * @param id Reel UUID.
     * @param data Processing result data including new status and output paths.
     */
    async setProcessingResult(
        id: string,
        data: ProcessingResultData,
    ): Promise<void> {
        await this.db.query(
            `UPDATE reels
       SET status           = $2,
           hls_path         = $3,
           thumbnail_key    = $4,
           duration_seconds = $5,
           updated_at       = now()
       WHERE id = $1`,
            [
                id,
                data.status,
                data.hls_path,
                data.thumbnail_key,
                data.duration_seconds,
            ],
        );
    }

    /**
     * Insert reel-tag associations. Silently ignores duplicates.
     *
     * @param reelId Reel UUID.
     * @param tagIds Array of tag UUIDs to associate.
     */
    async insertReelTags(reelId: string, tagIds: string[]): Promise<void> {
        if (tagIds.length === 0) return;

        const values = tagIds.map((_, i) => `($1, $${i + 2})`).join(", ");

        await this.db.query(
            `INSERT INTO reel_tags (reel_id, tag_id)
       VALUES ${values}
       ON CONFLICT DO NOTHING`,
            [reelId, ...tagIds],
        );
    }

    /**
     * Delete all tag associations for a reel.
     * Used before re-inserting a replacement tag set on PATCH.
     *
     * @param reelId Reel UUID.
     */
    async deleteReelTags(reelId: string): Promise<void> {
        await this.db.query(`DELETE FROM reel_tags WHERE reel_id = $1`, [
            reelId,
        ]);
    }

    // DB - Interaction methods (likes / saves)

    /**
     * Check whether a specific user has liked a specific reel.
     *
     * @param userId User UUID.
     * @param reelId Reel UUID.
     * @returns true if a like row exists.
     */
    async isLiked(userId: string, reelId: string): Promise<boolean> {
        const result = await this.db.query<{ exists: boolean }>(
            `SELECT EXISTS(
         SELECT 1 FROM liked_reels WHERE user_id = $1 AND reel_id = $2
       ) AS exists`,
            [userId, reelId],
        );
        return result.rows[0]?.exists ?? false;
    }

    /**
     * Check whether a specific user has saved a specific reel.
     *
     * @param userId User UUID.
     * @param reelId Reel UUID.
     * @returns true if a save row exists.
     */
    async isSaved(userId: string, reelId: string): Promise<boolean> {
        const result = await this.db.query<{ exists: boolean }>(
            `SELECT EXISTS(
         SELECT 1 FROM saved_reels WHERE user_id = $1 AND reel_id = $2
       ) AS exists`,
            [userId, reelId],
        );
        return result.rows[0]?.exists ?? false;
    }

    /**
     * Bulk-check which reels from a list the user has liked.
     *
     * @param userId User UUID.
     * @param reelIds Array of reel UUIDs to check.
     * @returns Array of reel IDs that the user has liked.
     */
    async bulkIsLiked(userId: string, reelIds: string[]): Promise<string[]> {
        if (reelIds.length === 0) return [];
        const result = await this.db.query<{ reel_id: string }>(
            `SELECT reel_id FROM liked_reels WHERE user_id = $1 AND reel_id = ANY($2)`,
            [userId, reelIds],
        );
        return result.rows.map((r) => r.reel_id);
    }

    /**
     * Bulk-check which reels from a list the user has saved.
     *
     * @param userId User UUID.
     * @param reelIds Array of reel UUIDs to check.
     * @returns Array of reel IDs that the user has saved.
     */
    async bulkIsSaved(userId: string, reelIds: string[]): Promise<string[]> {
        if (reelIds.length === 0) return [];
        const result = await this.db.query<{ reel_id: string }>(
            `SELECT reel_id FROM saved_reels WHERE user_id = $1 AND reel_id = ANY($2)`,
            [userId, reelIds],
        );
        return result.rows.map((r) => r.reel_id);
    }

    /**
     * Insert a like row. Silently ignores duplicate likes.
     *
     * @param userId User UUID.
     * @param reelId Reel UUID.
     */
    async like(userId: string, reelId: string): Promise<boolean> {
        const result = await this.db.query(
            `INSERT INTO liked_reels (user_id, reel_id, created_at)
            VALUES ($1, $2, now())
            ON CONFLICT DO NOTHING`,
            [userId, reelId],
        );

        return (result.rowCount ?? 0) > 0;
    }

    /**
     * Delete a like row.
     *
     * @param userId User UUID.
     * @param reelId Reel UUID.
     */
    async unlike(userId: string, reelId: string): Promise<boolean> {
        const result = await this.db.query(
            `DELETE FROM liked_reels WHERE user_id = $1 AND reel_id = $2`,
            [userId, reelId],
        );

        return (result.rowCount ?? 0) > 0;
    }

    /**
     * Insert a save row. Silently ignores duplicate saves.
     *
     * @param userId User UUID.
     * @param reelId Reel UUID.
     */
    async save(userId: string, reelId: string): Promise<boolean> {
        const result = await this.db.query(
            `INSERT INTO saved_reels (user_id, reel_id, created_at)
       VALUES ($1, $2, now())
       ON CONFLICT DO NOTHING`,
            [userId, reelId],
        );
        return (result.rowCount ?? 0) > 0;
    }

    /**
     * Delete a save row.
     *
     * @param userId User UUID.
     * @param reelId Reel UUID.
     */
    async unsave(userId: string, reelId: string): Promise<boolean> {
        const result = await this.db.query(
            `DELETE FROM saved_reels WHERE user_id = $1 AND reel_id = $2`,
            [userId, reelId],
        );

        return (result.rowCount ?? 0) > 0;
    }

    /**
     * Insert a report row. ON CONFLICT DO NOTHING enforces one report per
     * user per reel silently (no exception raised for duplicate reports).
     *
     * @param reporterId Reporting user UUID.
     * @param reelId Reported reel UUID.
     * @param reason Report category.
     * @param details Optional free-text additional context.
     */
    async insertReport(
        reporterId: string,
        reelId: string,
        reason: string,
        details?: string,
    ): Promise<void> {
        const id = uuidv7();
        await this.db.query(
            `INSERT INTO reports (id, reporter_id, reel_id, reason, details, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', now())
       ON CONFLICT (reporter_id, reel_id) DO NOTHING`,
            [id, reporterId, reelId, reason, details ?? null],
        );
    }

    // Cache - reel:meta:{reelId} Hash

    /**
     * Read the full reel metadata hash from Redis.
     *
     * @param reelId Reel UUID.
     * @returns Parsed ReelMeta or null on cache miss.
     */
    async getMetaFromCache(reelId: string): Promise<ReelMeta | null> {
        const key = `${REELS_REDIS_KEYS.META_PREFIX}:${reelId}`;
        const data = await this.redis.hgetall(key);
        if (!data || Object.keys(data).length === 0) return null;
        return data as unknown as ReelMeta;
    }

    /**
     * Write reel metadata to the Redis Hash and set TTL 300s.
     *
     * @param reelId Reel UUID.
     * @param reel Full Reel entity to cache.
     */
    async setMetaCache(reelId: string, reel: Reel): Promise<void> {
        const key = `${REELS_REDIS_KEYS.META_PREFIX}:${reelId}`;
        const flat: Record<string, string> = {
            id: reel.id,
            title: reel.title,
            description: reel.description ?? "",
            hls_path: reel.hls_path ?? "",
            thumbnail_key: reel.thumbnail_key ?? "",
            duration_seconds: String(reel.duration_seconds ?? ""),
            status: reel.status,
            difficulty: reel.difficulty,
            view_count: String(reel.view_count),
            like_count: String(reel.like_count),
            save_count: String(reel.save_count),
            share_count: String(reel.share_count),
            creator_id: reel.creator_id,
            username: reel.username,
            avatar_url: reel.avatar_url ?? "",
            tags: JSON.stringify(reel.tags),
            created_at: reel.created_at,
            updated_at: reel.updated_at,
        };

        await this.redis.hset(key, flat);
        await this.redis.expire(key, REELS_CACHE_TTL.META);
    }

    /**
     * Atomically increment a numeric counter field in the reel metadata hash.
     * Used for like_count, save_count, and view_count updates.
     *
     * @param reelId Reel UUID.
     * @param field Hash field name (e.g. 'like_count').
     * @param by Increment delta (positive or negative).
     */
    async incrMetaCount(
        reelId: string,
        field: string,
        by: number,
    ): Promise<void> {
        const key = `${REELS_REDIS_KEYS.META_PREFIX}:${reelId}`;
        await this.redis.hincrby(key, field, by);
    }

    /**
     * Delete the reel metadata cache entry.
     * Called on reel update, delete, or status change.
     *
     * @param reelId Reel UUID.
     */
    async deleteMetaCache(reelId: string): Promise<void> {
        await this.redis.del(`${REELS_REDIS_KEYS.META_PREFIX}:${reelId}`);
    }

    // Cache - reel:pending:{reelId} String

    /**
     * Store the raw S3 key for a pending upload. TTL 1800s.
     *
     * @param reelId Reel UUID.
     * @param rawKey S3 object key.
     */
    async setPendingReel(reelId: string, rawKey: string): Promise<void> {
        await this.redis.set(
            `${REELS_REDIS_KEYS.PENDING_PREFIX}:${reelId}`,
            rawKey,
            REELS_CACHE_TTL.PENDING,
        );
    }

    /**
     * Retrieve the pending raw S3 key for a reel.
     *
     * @param reelId Reel UUID.
     * @returns Raw S3 key or null if expired/missing.
     */
    async getPendingReel(reelId: string): Promise<string | null> {
        return this.redis.get(`${REELS_REDIS_KEYS.PENDING_PREFIX}:${reelId}`);
    }

    /**
     * Delete the pending reel key after a successful confirm.
     *
     * @param reelId Reel UUID.
     */
    async deletePendingReel(reelId: string): Promise<void> {
        await this.redis.del(`${REELS_REDIS_KEYS.PENDING_PREFIX}:${reelId}`);
    }

    // Cache - reel_tags:tag:{tagId} Set

    /**
     * Add a reel ID to a tag's active reel set (SADD).
     * Used when a reel becomes active.
     *
     * @param tagId Tag UUID.
     * @param reelId Reel UUID.
     */
    async addToTagSet(tagId: string, reelId: string): Promise<void> {
        await this.redis.sadd(
            `${REELS_REDIS_KEYS.TAG_SET_PREFIX}:${tagId}`,
            reelId,
        );
    }

    /**
     * Remove a reel ID from a tag's active reel set (SREM).
     * Used when a reel is deleted or disabled.
     *
     * @param tagId Tag UUID.
     * @param reelId Reel UUID.
     */
    async removeFromTagSet(tagId: string, reelId: string): Promise<void> {
        await this.redis.srem(
            `${REELS_REDIS_KEYS.TAG_SET_PREFIX}:${tagId}`,
            reelId,
        );
    }

    // Cache - feed:{userId} List

    /**
     * Read a slice of reel IDs from the user's feed List (LRANGE).
     *
     * @param userId User UUID.
     * @param start Inclusive start index.
     * @param stop Inclusive stop index.
     * @returns Array of reel ID strings.
     */
    async getFeedSlice(
        userId: string,
        start: number,
        stop: number,
    ): Promise<string[]> {
        return this.redis.lrange(
            `${REELS_REDIS_KEYS.FEED_PREFIX}:${userId}`,
            start,
            stop,
        );
    }

    /**
     * Get the total number of reel IDs in a user's feed List (LLEN).
     *
     * @param userId User UUID.
     * @returns Length of the feed list.
     */
    async getFeedLength(userId: string): Promise<number> {
        return this.redis.llen(`${REELS_REDIS_KEYS.FEED_PREFIX}:${userId}`);
    }
}
