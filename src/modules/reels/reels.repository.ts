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
import { BaseRepository } from "@database/base.repository";
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
    CHUNK_SIZE,
} from "./reels.constants";

/** Shape passed to createWithTags - full reel creation payload including tags. */
interface CreateReelWithTagsData {
    id: string;
    creatorId: string;
    title: string;
    description?: string;
    difficulty: ReelDifficulty;
    tagIds: string[];
}

/** Shape stored in / retrieved from the reel:draft:{reelId} Redis Hash. */
interface ReelDraft {
    creatorId: string;
    title: string;
    description?: string;
    difficulty: ReelDifficulty;
    tagIds: string[]; // JSON-encoded string[]
    rawKey: string;
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

/** Decoded compound cursor for liked/saved list pagination. */
export interface InteractionCursor {
    timestamp: string;
    id: string;
}

/** Reel row extended with the interaction table's created_at for cursor building. */
export interface InteractedReel extends Reel {
    /** created_at from liked_reels or saved_reels - used to build next cursor. */
    lr_created_at: string;
}

/**
 * Repository handling all persistence and cache operations for the Reels module.
 */
@Injectable()
export class ReelsRepository extends BaseRepository {
    private readonly logger = new Logger(ReelsRepository.name);
    private readonly REELS_COMMON_SQL = `SELECT
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
        LEFT JOIN tags t ON t.id = rt.tag_id`;

    constructor(db: DatabaseService, redis: RedisService) {
        super(db, redis);
    }

    // DB - Read methods

    /**
     * Fetch a single reel by ID, joined with creator info and aggregated tags.
     * Returns null if the reel is soft-deleted.
     *
     * @param id Reel UUID.
     * @returns Reel entity or null.
     */
    async findById(id: string): Promise<Reel | null> {
        return await this.findOne<Reel>(
            `${this.REELS_COMMON_SQL}
            WHERE r.id = $1 AND r.status = 'active' AND r.deleted_at IS NULL
            GROUP BY r.id, u.username, u.avatar_url`,
            [id],
        );
    }

    async bulkFindByIds(ids: string[]): Promise<Reel[]> {
        if (ids.length === 0) return [];

        return await this.findMany<Reel>(
            `${this.REELS_COMMON_SQL}
            WHERE r.id = ANY($1)
                 AND r.status = 'active'
                 AND r.deleted_at IS NULL
            GROUP BY r.id, u.username, u.avatar_url`,
            [ids],
        );
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

        return await this.findMany<Reel>(
            `${this.REELS_COMMON_SQL}
            WHERE ${conditions.join(" AND ")}
            GROUP BY r.id, u.username, u.avatar_url
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT $2`,
            params,
        );
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
            `r.status = 'active'`,
            "r.deleted_at IS NULL",
        ];

        if (cursor) {
            params.push(cursor);
            conditions.push(`r.id < $${params.length}`);
        }

        return await this.findMany<Reel>(
            `${this.REELS_COMMON_SQL}
            WHERE ${conditions.join(" AND ")}
            GROUP BY r.id, u.username, u.avatar_url
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT $1`,
            params,
        );
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

        return await this.findMany<Reel>(
            `${this.REELS_COMMON_SQL}
            WHERE ${conditions.join(" AND ")}
            GROUP BY r.id, u.username, u.avatar_url
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT $1`,
            params,
        );
    }

    /**
     * Validate that all provided tag UUIDs exist in the tags table.
     *
     * @deprecated use method in TagsRepository instead
     * @param tagIds Candidate tag UUIDs.
     * @returns Array of matching tag IDs that actually exist.
     */
    async validateTagIds(tagIds: string[]): Promise<string[]> {
        const rows = await this.findMany<{ id: string }>(
            `SELECT id FROM tags WHERE id = ANY($1)`,
            [tagIds],
        );
        return rows.map((r) => r.id);
    }

    /**
     * Fetch tags associated with a reel from the DB.
     * Used by ReelsProcessingService (Media module integration).
     *
     * @param reelId Reel UUID.
     * @returns Array of tag objects.
     */
    async getTagsForReel(reelId: string): Promise<ReelTag[]> {
        return await this.findMany<ReelTag>(
            `SELECT t.id, t.name, t.category
            FROM tags t
            JOIN reel_tags rt ON rt.tag_id = t.id
            WHERE rt.reel_id = $1`,
            [reelId],
        );
    }

    /**
     * Find tags whose name or category matches a plain-text query (case-insensitive).
     * Used by the search endpoint to resolve query string -> tag IDs.
     *
     * @param q Plain-text search query.
     * @returns Array of matching tag objects (id, name, category).
     */
    async findTagsByQuery(
        q: string,
    ): Promise<{ id: string; name: string; category: string }[]> {
        return await this.findMany<{
            id: string;
            name: string;
            category: string;
        }>(
            `SELECT id, name, category
            FROM tags
            WHERE name ILIKE $1
                OR category ILIKE $1`,
            [`%${q}%`],
        );
    }

    /**
     * Fetch active reels from a candidate ID set, sorted by view_count DESC.
     * Candidate IDs come from a Redis SUNION - DB handles sort and pagination.
     * Returns both the page of results and the total candidate count for has_more.
     *
     * @param candidateIds Array of reel UUIDs from Redis SUNION (already BF-filtered).
     * @param offset Integer offset for pagination.
     * @param limit Page size.
     * @returns Object with reel rows and total count of valid candidates.
     */
    async searchCandidates(
        candidateIds: string[],
        offset: number,
        limit: number,
    ): Promise<{ reels: Reel[]; total: number }> {
        if (candidateIds.length === 0) return { reels: [], total: 0 };

        const countResult = await this.findOne<{ count: string }>(
            `SELECT COUNT(*)::text AS count
            FROM reels
            WHERE id = ANY($1)
                AND status = 'active'
                AND deleted_at IS NULL`,
            [candidateIds],
        );

        const total = this.parseCount(countResult?.count);

        if (total === 0) return { reels: [], total: 0 };

        const reels = await this.findMany<Reel>(
            `${this.REELS_COMMON_SQL}
            WHERE r.id = ANY($1)
              AND r.status = 'active'
              AND r.deleted_at IS NULL
            GROUP BY r.id, u.username, u.avatar_url
            ORDER BY r.view_count DESC
            LIMIT $2 OFFSET $3`,
            [candidateIds, limit, offset],
        );

        return { reels, total };
    }

    /**
     * Fetch active reel IDs from DB for a given set of tag IDs.
     * Used as fallback when Redis tag sets are empty (cache miss or flush).
     *
     * @param tagIds Array of tag UUIDs to search against.
     * @returns Array of reel ID strings.
     */
    async findActiveReelIdsByTagIds(tagIds: string[]): Promise<string[]> {
        if (tagIds.length === 0) return [];
        const rows = await this.findMany<{ id: string }>(
            `SELECT DISTINCT r.id
            FROM reels r
            JOIN reel_tags rt ON rt.reel_id = r.id
            WHERE rt.tag_id = ANY($1)
                AND r.status = 'active'
                AND r.deleted_at IS NULL`,
            [tagIds],
        );
        return rows.map((r) => r.id);
    }

    /**
     * Fetch candidate reels for cold start feed personalisation.
     * Two-part UNION:
     *   Part 1 - reels from user's top 5 affinity tags (personalised)
     *   Part 2 - popular reels from categories NOT in user's affinity (variety)
     * UNION deduplicates automatically.
     * Returns reel ID and category for round-robin interleaving in service layer.
     *
     * @param userId User UUID.
     * @returns Array of { reelId, category } spanning multiple categories.
     */
    async getColdStartCandidates(
        userId: string,
    ): Promise<{ reelId: string; category: string }[]> {
        const rows = await this.findMany<{
            reel_id: string;
            category: string;
        }>(
            `WITH affinity_tags AS (
             -- User's top 5 tags by score
             SELECT tag_id
             FROM user_topic_affinity
             WHERE user_id = $1
             ORDER BY score DESC
             LIMIT 5
         ),
         affinity_categories AS (
             -- Categories covered by user's affinity tags
             SELECT DISTINCT t.category
             FROM tags t
             JOIN affinity_tags at ON at.tag_id = t.id
         ),
         part1 AS (
             -- Reels from user's affinity tags
             SELECT DISTINCT ON (r.id) r.id AS reel_id, t.category
             FROM user_topic_affinity uta
             JOIN affinity_tags at ON at.tag_id = uta.tag_id
             JOIN reel_tags rt     ON rt.tag_id = uta.tag_id
             JOIN reels r          ON r.id = rt.reel_id
             JOIN tags t           ON t.id = rt.tag_id
             WHERE uta.user_id = $1
               AND r.status = 'active'
               AND r.deleted_at IS NULL
             ORDER BY r.id
         ),
         part2 AS (
             -- Popular reels from categories NOT in user's affinity
             SELECT DISTINCT ON (r.id) r.id AS reel_id, t.category
             FROM reels r
             JOIN reel_tags rt ON rt.reel_id = r.id
             JOIN tags t       ON t.id = rt.tag_id
             WHERE r.status = 'active'
               AND r.deleted_at IS NULL
               AND t.category NOT IN (SELECT category FROM affinity_categories)
             ORDER BY r.id, r.view_count DESC
             LIMIT 20
         ),
         combined AS (
             SELECT reel_id, category FROM part1
             UNION
             SELECT reel_id, category FROM part2
         )
         SELECT reel_id, category
         FROM combined
         ORDER BY RANDOM()`,
            [userId],
        );
        return rows.map((row) => ({
            reelId: row.reel_id,
            category: row.category,
        }));
    }

    // DB - Write methods

    /**
     * Insert a reel row and its tag associations in a single transaction.
     * Called by confirmReel after the S3 upload is verified.
     * Status is set to processing immediately - no intermediate uploading state
     * since the DB row is only created once the upload is confirmed.
     *
     * @param data Full reel creation payload including tag IDs.
     * @returns Newly created Reel entity with joined creator and tags.
     */
    async createWithTags(data: CreateReelWithTagsData): Promise<Reel> {
        const now = new Date().toISOString();

        await this.db.withTransaction(async (client) => {
            await client.query(
                `INSERT INTO reels (
                    id, creator_id, title, description, difficulty,
                    status, view_count, like_count, save_count, share_count,
                    created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5,
                    'processing', 0, 0, 0, 0,
                    $6, $6
                )`,
                [
                    data.id,
                    data.creatorId,
                    data.title,
                    data.description ?? null,
                    data.difficulty,
                    now,
                ],
            );

            if (data.tagIds.length > 0) {
                const values = data.tagIds
                    .map((_, i) => `($1, $${i + 2})`)
                    .join(", ");
                await client.query(
                    `INSERT INTO reel_tags (reel_id, tag_id)
                    VALUES ${values}
                    ON CONFLICT DO NOTHING`,
                    [data.id, ...data.tagIds],
                );
            }
        });

        // Re-fetch with full joins so caller gets creator + tags in the response
        return (await this.findById(data.id))!;
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
            `UPDATE reels SET status = 'processing', updated_at = now() WHERE id = $1`,
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
            SET status = 'deleted', deleted_at = now(), updated_at = now()
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
        return await this.existsWhere(
            `SELECT EXISTS(
                SELECT 1 FROM liked_reels WHERE user_id = $1 AND reel_id = $2
            ) AS exists`,
            [userId, reelId],
        );
    }

    /**
     * Check whether a specific user has saved a specific reel.
     *
     * @param userId User UUID.
     * @param reelId Reel UUID.
     * @returns true if a save row exists.
     */
    async isSaved(userId: string, reelId: string): Promise<boolean> {
        return await this.existsWhere(
            `SELECT EXISTS(
                SELECT 1 FROM saved_reels WHERE user_id = $1 AND reel_id = $2
            ) AS exists`,
            [userId, reelId],
        );
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
        const rows = await this.findMany<{ reel_id: string }>(
            `SELECT reel_id FROM liked_reels WHERE user_id = $1 AND reel_id = ANY($2)`,
            [userId, reelIds],
        );
        return rows.map((r) => r.reel_id);
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
        const rows = await this.findMany<{ reel_id: string }>(
            `SELECT reel_id FROM saved_reels WHERE user_id = $1 AND reel_id = ANY($2)`,
            [userId, reelIds],
        );
        return rows.map((r) => r.reel_id);
    }

    /**
     * Fetch a paginated list of reels the user has liked, most recently liked first.
     * Active reels only. Uses compound keyset cursor on (lr.created_at, lr.reel_id)
     * for stable pagination.
     *
     * @param userId User UUID.
     * @param limit Page size (fetch limit + 1 to determine has_more).
     * @param cursor Optional decoded compound cursor { timestamp, id }.
     * @returns Array of InteractedReel (Reel + lr_created_at alias).
     */
    async findLikedByUser(
        userId: string,
        limit: number,
        cursor?: InteractionCursor,
    ): Promise<InteractedReel[]> {
        const params: unknown[] = [userId, limit];
        let cursorClause = "";

        if (cursor) {
            params.push(cursor.timestamp, cursor.id);
            cursorClause = `AND (lr.created_at, lr.reel_id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
        }

        return await this.findMany<InteractedReel>(
            `SELECT
                r.*,
                u.username,
                u.avatar_url,
                lr.created_at AS lr_created_at,
                COALESCE(
                    json_agg(
                        json_build_object('id', t.id, 'name', t.name, 'category', t.category)
                    ) FILTER (WHERE t.id IS NOT NULL),
                    '[]'
                ) AS tags
            FROM liked_reels lr
            JOIN reels r ON r.id = lr.reel_id
            JOIN users u ON u.id = r.creator_id
            LEFT JOIN reel_tags rt ON rt.reel_id = r.id
            LEFT JOIN tags t ON t.id = rt.tag_id
            WHERE lr.user_id = $1
              AND r.status = 'active'
              AND r.deleted_at IS NULL
              ${cursorClause}
            GROUP BY r.id, u.username, u.avatar_url, lr.created_at, lr.reel_id
            ORDER BY lr.created_at DESC, lr.reel_id DESC
            LIMIT $2`,
            params,
        );
    }

    /**
     * Fetch a paginated list of reels the user has saved, most recently saved first.
     * Active reels only. Uses compound keyset cursor on (sr.created_at, sr.reel_id).
     *
     * @param userId User UUID.
     * @param limit Page size (fetch limit + 1 to determine has_more).
     * @param cursor Optional decoded compound cursor { timestamp, id }.
     * @returns Array of InteractedReel (Reel + lr_created_at alias).
     */
    async findSavedByUser(
        userId: string,
        limit: number,
        cursor?: InteractionCursor,
    ): Promise<InteractedReel[]> {
        const params: unknown[] = [userId, limit];
        let cursorClause = "";

        if (cursor) {
            params.push(cursor.timestamp, cursor.id);
            cursorClause = `AND (sr.created_at, sr.reel_id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
        }

        return await this.findMany<InteractedReel>(
            `SELECT
                r.*,
                u.username,
                u.avatar_url,
                sr.created_at AS lr_created_at,
                COALESCE(
                    json_agg(
                        json_build_object('id', t.id, 'name', t.name, 'category', t.category)
                    ) FILTER (WHERE t.id IS NOT NULL),
                    '[]'
                ) AS tags
            FROM saved_reels sr
            JOIN reels r ON r.id = sr.reel_id
            JOIN users u ON u.id = r.creator_id
            LEFT JOIN reel_tags rt ON rt.reel_id = r.id
            LEFT JOIN tags t ON t.id = rt.tag_id
            WHERE sr.user_id = $1
              AND r.status = 'active'
              AND r.deleted_at IS NULL
              ${cursorClause}
            GROUP BY r.id, u.username, u.avatar_url, sr.created_at, sr.reel_id
            ORDER BY sr.created_at DESC, sr.reel_id DESC
            LIMIT $2`,
            params,
        );
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

    /**
     * Increment the share_count of a reel by 1.
     * NOT idempotent - every call increments. Multiple shares from the
     * same user are valid (copy-link action can be repeated).
     *
     * @param reelId Reel UUID.
     * @returns void
     */
    async incrementShareCount(reelId: string): Promise<void> {
        await this.db.query(
            `UPDATE reels
            SET share_count = share_count + 1,
                updated_at  = now()
            WHERE id = $1`,
            [reelId],
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
     * Sets the metadata of multiple reels to Redis cache in chunks.
     * @param reelIds UUIDs of the reels to cache.
     */
    async setReelsToCache(reelIds: string[]): Promise<void> {
        if (reelIds.length === 0) {
            return;
        }

        this.logger.debug(`Caching metadata for ${reelIds.length} reels in chunks of ${CHUNK_SIZE}`);

        for (let i = 0; i < reelIds.length; i += CHUNK_SIZE) {
            const chunkIds = reelIds.slice(i, i + CHUNK_SIZE);
            const reels = await this.bulkFindByIds(chunkIds);

            const pipeline = this.redis.client.pipeline();
            for (const reel of reels) {
                const key = `${REELS_REDIS_KEYS.META_PREFIX}:${reel.id}`;
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
                pipeline.hset(key, flat);
                pipeline.expire(key, REELS_CACHE_TTL.META); // 1 hour TTL
            }

            await pipeline.exec();
        }

        this.logger.debug(`Finished caching metadata for ${reelIds.length} reels`);
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
        const key = `${REELS_REDIS_KEYS.INTERACTION_META_PREFIX}:${reelId}`;
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

    // Cache - reel:draft:{reelId} Hash

    /**
     * Persist all reel metadata as a Redis Hash draft before the upload is confirmed.
     * No DB writes happen until confirmReel succeeds.
     * TTL matches the presigned URL window - draft auto-expires with the URL.
     *
     * @param reelId Reel UUID (generated client-side before any DB row exists).
     * @param draft  Full draft payload to store.
     */
    async setDraft(reelId: string, draft: ReelDraft): Promise<void> {
        const key = `${REELS_REDIS_KEYS.DRAFT_PREFIX}:${reelId}`;
        await this.redis.hset(key, {
            creatorId: draft.creatorId,
            title: draft.title,
            description: draft.description ?? "",
            difficulty: draft.difficulty,
            tagIds: JSON.stringify(draft.tagIds),
            rawKey: draft.rawKey,
        });
        await this.redis.expire(key, REELS_CACHE_TTL.DRAFT);
    }

    /**
     * Retrieve a pending upload draft from Redis.
     * Returns null when the draft has expired or never existed.
     *
     * @param reelId Reel UUID.
     * @returns Parsed draft object or null on cache miss.
     */
    async getDraft(reelId: string): Promise<ReelDraft | null> {
        const key = `${REELS_REDIS_KEYS.DRAFT_PREFIX}:${reelId}`;
        const data = await this.redis.hgetall(key);
        if (!data || Object.keys(data).length === 0) return null;

        return {
            creatorId: data.creatorId,
            title: data.title,
            description: data.description || undefined,
            difficulty: data.difficulty as ReelDifficulty,
            tagIds: JSON.parse(data.tagIds ?? "[]") as string[],
            rawKey: data.rawKey,
        };
    }

    /**
     * Delete the draft after a successful confirm.
     *
     * @param reelId Reel UUID.
     */
    async deleteDraft(reelId: string): Promise<void> {
        await this.redis.del(`${REELS_REDIS_KEYS.DRAFT_PREFIX}:${reelId}`);
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
     * Add a reel ID to multiple tags' active reel sets (SADD) using a pipeline.
     * Used when a reel becomes active.
     *
     * @param tagIds Array of Tag UUIDs.
     * @param reelId Reel UUID.
     */
    async bulkAddToTagSets(tagIds: string[], reelId: string): Promise<void> {
        if (tagIds.length === 0) return;
        await this.redis.withPipeline((pipeline) => {
            for (const tagId of tagIds) {
                pipeline.sadd(
                    `${REELS_REDIS_KEYS.TAG_SET_PREFIX}:${tagId}`,
                    reelId,
                );
            }
        });
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

    /**
     * Remove a reel ID from multiple tags' active reel sets (SREM) using a pipeline.
     * Used when a reel is deleted or disabled.
     *
     * @param tagIds Array of Tag UUIDs.
     * @param reelId Reel UUID.
     */
    async bulkRemoveFromTagSets(tagIds: string[], reelId: string): Promise<void> {
        if (tagIds.length === 0) return;
        await this.redis.withPipeline((pipeline) => {
            for (const tagId of tagIds) {
                pipeline.srem(
                    `${REELS_REDIS_KEYS.TAG_SET_PREFIX}:${tagId}`,
                    reelId,
                );
            }
        });
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
     * Atomically pop N reel IDs from the left of the user's feed list.
     * Non-blocking - returns empty array if list is empty.
     * Client is responsible for caching popped IDs for in-session backward scroll.
     *
     * @param userId User UUID.
     * @param count Number of items to pop.
     * @returns Array of popped reel ID strings.
     */
    async popFeedItems(userId: string, count: number): Promise<string[]> {
        return this.redis.lpop(
            `${REELS_REDIS_KEYS.FEED_PREFIX}:${userId}`,
            count,
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
