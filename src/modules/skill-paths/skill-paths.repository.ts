/**
 * @module modules/skill-paths/skill-paths.repository
 * @description
 * Data-access layer for the Skill Paths module.
 * Combines PostgreSQL persistence (DatabaseService) and Redis cache
 * operations (RedisService), following the same pattern as ChallengesRepository.
 *
 * Pattern rules (mirrors existing codebase):
 *   - DB methods:    pure SQL - query DB, return domain types or null, no cache ops.
 *   - Cache methods: pure Redis - get/set/del, no DB calls.
 *   - Service owns cache-aside orchestration (check cache -> miss -> DB -> set cache).
 *
 * All SQL uses parameterised queries - never string interpolation.
 * deleted_at IS NULL on all soft-delete table queries.
 * "order" is always quoted - SQL reserved word.
 */

import { Injectable } from "@nestjs/common";
import { PoolClient } from "pg";
import { DatabaseService } from "@database/database.service";
import { RedisService } from "@redis/redis.service";
import { BaseRepository } from "@database/base.repository";
import { uuidv7 } from "@common/utils/uuidv7.util";
import {
    SkillPath,
    PathReel,
    Enrolment,
    EnrolledPath,
    NextReel,
    EnrolledPathForReel,
    UpdateEnrolmentData,
    UpdatePathData,
    InsertPathData,
} from "./entities/skill-path.entity";
import {
    SKILL_PATH_REDIS_KEYS,
    SKILL_PATH_CACHE_TTL,
    SKILL_PATH_DIFFICULTIES,
    SkillPathDifficulty,
} from "./skill-paths.constants";

/** Options passed to findAll for the published path list. */
interface FindAllOpts {
    difficulty?: SkillPathDifficulty;
    cursor?: string;
    limit: number;
}

type CreatePathResult = Pick<
    SkillPath,
    | "id"
    | "title"
    | "total_reels"
    | "estimated_duration_minutes"
    | "is_published"
    | "created_at"
>;

type UpdatePathResult = Pick<
    SkillPath,
    | "id"
    | "title"
    | "total_reels"
    | "estimated_duration_minutes"
    | "is_published"
    | "updated_at"
>;

type UserEnrolmentSummary = Pick<
    Enrolment,
    | "path_id"
    | "status"
    | "progress_count"
    | "enrolled_at"
    | "completed_at"
>;

/**
 * Repository for skill path persistence and enrolment tracking.
 * DB methods and cache methods are strictly separated.
 * The service composes them via cache-aside logic.
 */
@Injectable()
export class SkillPathsRepository extends BaseRepository {
    constructor(
        db: DatabaseService,
        redis: RedisService,
    ) {
        super(db, redis);
    }

    // =========================================================================
    // DB - Path reads
    // =========================================================================

    /**
     * Fetches a paginated list of published, non-deleted skill paths.
     * Optionally filtered by difficulty.
     * Keyset pagination on (created_at DESC, id DESC) - stable with UUIDv7.
     *
     * @param opts difficulty filter, cursor UUID, and limit.
     * @returns SkillPath[] (may be empty).
     */
    async findAll(opts: FindAllOpts): Promise<SkillPath[]> {
        const params: unknown[] = [
            opts.difficulty ?? null, // $1 - null means no difficulty filter
            opts.cursor ?? null, // $2 - null means first page
            opts.limit, // $3
        ];

        return await this.findMany<SkillPath>(
            `SELECT *
             FROM   skill_paths
             WHERE  is_published = true
               AND  deleted_at   IS NULL
               AND  ($1::text IS NULL OR difficulty = $1::difficulty_level)
               AND  ($2::uuid IS NULL OR (created_at, id) < (
                        SELECT created_at, id FROM skill_paths
                        WHERE  id = $2::uuid AND deleted_at IS NULL
                    ))
             ORDER  BY created_at DESC, id DESC
             LIMIT  $3`,
            params,
        );
    }

    /**
     * Fetches a single skill path by primary key.
     * Returns unpublished and soft-deleted paths - callers must check
     * is_published and deleted_at based on context (service enforces visibility).
     *
     * @param pathId Skill path UUID.
     * @returns SkillPath or null if not found.
     */
    async findById(pathId: string): Promise<SkillPath | null> {
        return await this.findOne<SkillPath>(
            `SELECT *
             FROM   skill_paths
             WHERE  id = $1
               AND  deleted_at IS NULL`,
            [pathId],
        );
    }

    /**
     * Fetches the ordered reel list for a path, with tags aggregated per reel.
     * Returns the raw thumbnail_key - service converts to URL via CDN_BASE_URL.
     *
     * @param pathId Skill path UUID.
     * @returns PathReel[] ordered by position ascending.
     */
    async getPathReels(pathId: string): Promise<PathReel[]> {
        return await this.findMany<PathReel>(
            `SELECT
                spr."order",
                r.id,
                r.title,
                r.difficulty,
                r.thumbnail_key,
                COALESCE(r.duration_seconds, 0) AS duration,
                COALESCE(
                    json_agg(
                        json_build_object('name', t.name)
                    ) FILTER (WHERE t.name IS NOT NULL),
                    '[]'
                ) AS tags
             FROM   skill_path_reels spr
             JOIN   reels     r  ON r.id  = spr.reel_id
             LEFT   JOIN reel_tags rt ON rt.reel_id = r.id
             LEFT   JOIN tags      t  ON t.id  = rt.tag_id
             WHERE  spr.path_id    = $1
               AND  r.deleted_at   IS NULL
             GROUP  BY spr."order", r.id
             ORDER  BY spr."order" ASC`,
            [pathId],
        );
    }

    // =========================================================================
    // DB - Enrolment reads
    // =========================================================================

    /**
     * Batch-fetches enrolment status for a user across multiple path IDs.
     * Used in getPaths to merge is_enrolled / progress_count / status into
     * each list item without N individual queries.
     *
     * @param userId   User UUID.
     * @param pathIds  Array of path UUIDs to look up.
     * @returns Partial enrolment rows indexed by path_id.
     */
    async getUserEnrolments(
        userId: string,
        pathIds: string[],
    ): Promise<UserEnrolmentSummary[]> {
        if (pathIds.length === 0) return [];

        return await this.findMany<UserEnrolmentSummary>(
            `SELECT path_id, status, progress_count, enrolled_at, completed_at
             FROM   user_skill_paths
             WHERE  user_id = $1
               AND  path_id = ANY($2)`,
            [userId, pathIds],
        );
    }

    /**
     * Fetches the full enrolment row for a single user+path pair.
     *
     * @param userId  User UUID.
     * @param pathId  Skill path UUID.
     * @returns Full Enrolment row or null if not enrolled.
     */
    async getEnrolment(
        userId: string,
        pathId: string,
    ): Promise<Enrolment | null> {
        return await this.findOne<Enrolment>(
            `SELECT user_id, path_id, status, progress_count,
                    certificate_url, enrolled_at, completed_at, updated_at
             FROM   user_skill_paths
             WHERE  user_id = $1
               AND  path_id = $2`,
            [userId, pathId],
        );
    }

    /**
     * Fetches all completed reel IDs for a user in a specific path.
     * Used in getPathById to compute per-reel is_completed flags.
     *
     * @param userId  User UUID.
     * @param pathId  Skill path UUID.
     * @returns Array of reel UUIDs the user has completed in this path.
     */
    async getUserProgress(userId: string, pathId: string): Promise<string[]> {
        const rows = await this.findMany<{ reel_id: string }>(
            `SELECT reel_id
             FROM   user_skill_path_progress
             WHERE  user_id = $1
               AND  path_id = $2`,
            [userId, pathId],
        );
        return rows.map((r) => r.reel_id);
    }

    /**
     * Fetches all enrolled paths for a user, joined with path metadata.
     * Ordered by enrolled_at DESC (most recently enrolled first).
     *
     * @param userId User UUID.
     * @returns EnrolledPath[] with path title, difficulty, thumbnail, and status.
     */
    async findEnrolledByUser(userId: string): Promise<EnrolledPath[]> {
        return await this.findMany<EnrolledPath>(
            `SELECT
                usp.path_id,
                usp.status,
                usp.progress_count,
                usp.enrolled_at,
                usp.completed_at,
                sp.title,
                sp.difficulty,
                sp.thumbnail_url,
                sp.total_reels
             FROM   user_skill_paths usp
             JOIN   skill_paths sp ON sp.id = usp.path_id
             WHERE  usp.user_id    = $1
               AND  sp.deleted_at  IS NULL
             ORDER  BY usp.enrolled_at DESC`,
            [userId],
        );
    }

    /**
     * Finds the first unwatched reel in a path for a given user.
     * Used by getProgress to populate the next_reel field.
     *
     * @param userId  User UUID.
     * @param pathId  Skill path UUID.
     * @returns NextReel (order, id, title) or null if all reels are done.
     */
    async getNextReel(
        userId: string,
        pathId: string,
    ): Promise<NextReel | null> {
        return await this.findOne<NextReel>(
            `SELECT spr."order", r.id, r.title
             FROM   skill_path_reels spr
             JOIN   reels r ON r.id = spr.reel_id
             WHERE  spr.path_id = $1
               AND  spr.reel_id NOT IN (
                   SELECT reel_id
                   FROM   user_skill_path_progress
                   WHERE  user_id = $2
                     AND  path_id = $1
               )
             ORDER  BY spr."order" ASC
             LIMIT  1`,
            [pathId, userId],
        );
    }

    /**
     * The key subscriber query.
     * Finds all paths where the user is currently enrolled (in_progress) AND
     * the given reel belongs to that path. Handles reels that appear in multiple paths.
     *
     * Returns progress_count and completed_at so the subscriber can:
     *   - compute new_count = progress_count + 1 without extra DB hits
     *   - determine isFirstCompletion = completed_at === null
     *
     * @param userId  User UUID.
     * @param reelId  Reel UUID from the watch event.
     * @returns Array of path context rows (empty if user not enrolled in any qualifying path).
     */
    async getEnrolledPathIdsForReel(
        userId: string,
        reelId: string,
    ): Promise<EnrolledPathForReel[]> {
        return await this.findMany<EnrolledPathForReel>(
            `SELECT
                usp.path_id,
                sp.total_reels,
                usp.progress_count,
                usp.completed_at,
                sp.title AS path_title
             FROM   user_skill_paths  usp
             JOIN   skill_path_reels  spr ON spr.path_id = usp.path_id
             JOIN   skill_paths       sp  ON sp.id       = usp.path_id
             WHERE  usp.user_id  = $1
               AND  spr.reel_id  = $2
               AND  usp.status   = 'in_progress'
               AND  sp.deleted_at IS NULL`,
            [userId, reelId],
        );
    }

    // =========================================================================
    // DB - Admin / validation reads
    // =========================================================================

    /**
     * Validates that all provided reel IDs exist, are active, and are not soft-deleted.
     * Used before creating or updating a path's reel list.
     *
     * @param reelIds Array of reel UUIDs to validate.
     * @returns Array of valid reel IDs found in DB. Service compares length to input.
     */
    async validateReelIds(reelIds: string[]): Promise<string[]> {
        if (reelIds.length === 0) return [];

        const rows = await this.findMany<{ id: string }>(
            `SELECT id
             FROM   reels
             WHERE  id         = ANY($1)
               AND  status     = 'active'
               AND  deleted_at IS NULL`,
            [reelIds],
        );
        return rows.map((r) => r.id);
    }

    /**
     * Sums the duration_seconds of all given reels.
     * Used to compute estimated_duration_minutes on create/update.
     * NULL durations (unprocessed reels) are treated as 0 via COALESCE.
     *
     * @param reelIds Array of reel UUIDs.
     * @returns Total duration in seconds.
     */
    async getReelsDurationSum(reelIds: string[]): Promise<number> {
        if (reelIds.length === 0) return 0;

        const row = await this.findOne<{ total_seconds: string }>(
            `SELECT COALESCE(SUM(duration_seconds), 0) AS total_seconds
             FROM   reels
             WHERE  id = ANY($1)`,
            [reelIds],
        );
        return this.parseCount(row?.total_seconds);
    }

    // =========================================================================
    // DB - Path writes
    // =========================================================================

    /**
     * Inserts a new skill path row.
     * Returns only the fields included in PathResponseDto - callers do not
     * need the full row after create.
     *
     * @param data Full insert payload including pre-generated UUIDv7 id.
     * @returns Inserted row fields for PathResponseDto.
     */
    async createPath(
        data: InsertPathData,
    ): Promise<CreatePathResult> {
        const result = await this.db.query<CreatePathResult>(
            `INSERT INTO skill_paths
               (id, title, description, difficulty, thumbnail_url, total_reels,
                estimated_duration_minutes, is_published, created_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
             RETURNING id, title, total_reels, estimated_duration_minutes, is_published, created_at`,
            [
                data.id,
                data.title,
                data.description,
                data.difficulty,
                data.thumbnail_url ?? null,
                data.total_reels,
                data.estimated_duration_minutes,
                data.is_published,
                data.created_by,
            ],
        );
        return result.rows[0];
    }

    /**
     * Partially updates a skill path. Uses COALESCE so omitted fields keep
     * their current DB values. Always sets updated_at = now().
     *
     * @param pathId UUID of the path to update.
     * @param data   Fields to update (only provided fields are changed).
     * @returns Updated row fields for PathResponseDto.
     */
    async updatePath(
        pathId: string,
        data: UpdatePathData,
    ): Promise<UpdatePathResult> {
        const result = await this.db.query<UpdatePathResult>(
            `UPDATE skill_paths
             SET    title                      = COALESCE($2, title),
                    description                = COALESCE($3, description),
                    difficulty                 = COALESCE($4, difficulty),
                    thumbnail_url              = COALESCE($5, thumbnail_url),
                    is_published               = COALESCE($6, is_published),
                    total_reels                = COALESCE($7, total_reels),
                    estimated_duration_minutes = COALESCE($8, estimated_duration_minutes),
                    updated_at                 = now()
             WHERE  id         = $1
               AND  deleted_at IS NULL
             RETURNING id, title, total_reels, estimated_duration_minutes, is_published, updated_at`,
            [
                pathId,
                data.title ?? null,
                data.description ?? null,
                data.difficulty ?? null,
                data.thumbnail_url !== undefined ? data.thumbnail_url : null,
                data.is_published !== undefined ? data.is_published : null,
                data.total_reels ?? null,
                data.estimated_duration_minutes ?? null,
            ],
        );
        return result.rows[0];
    }

    /**
     * Soft-deletes a skill path by setting deleted_at = now().
     * Enrolled users are unaffected - their user_skill_paths rows remain
     * as historical records. The path becomes unreachable via public endpoints.
     *
     * @param pathId UUID of the path to soft-delete.
     */
    async softDeletePath(pathId: string): Promise<void> {
        await this.db.query(
            `UPDATE skill_paths
             SET deleted_at = now(),
                 updated_at = now()
             WHERE id         = $1
               AND deleted_at IS NULL`,
            [pathId],
        );
    }

    /**
     * Atomically replaces the reel list for a path inside a transaction.
     * Hard-deletes all existing skill_path_reels rows for the path, then
     * inserts the new ordered list (1-indexed).
     *
     * Must be called with a client acquired via db.getClient() so the two
     * operations are atomic. The caller (service) owns the transaction lifecycle.
     *
     * @param pathId  Skill path UUID.
     * @param reelIds New ordered array of reel UUIDs (position = index + 1).
     * @param client  Active PoolClient - caller must BEGIN/COMMIT/ROLLBACK.
     */
    async setPathReels(
        pathId: string,
        reelIds: string[],
        client: PoolClient,
    ): Promise<void> {
        // Hard-delete existing junction rows (junction table - no soft-delete)
        await client.query(`DELETE FROM skill_path_reels WHERE path_id = $1`, [
            pathId,
        ]);

        if (reelIds.length === 0) return;

        // Build parameterised VALUES for bulk insert
        // Parameters: $1 = pathId, then $2..$N alternating reelId and order
        const values: unknown[] = [pathId];
        const rows: string[] = [];

        reelIds.forEach((reelId, index) => {
            const reelParam = `$${values.length + 1}`;
            const orderParam = `$${values.length + 2}`;
            values.push(reelId, index + 1); // 1-indexed order
            rows.push(`($1, ${reelParam}, ${orderParam}, now())`);
        });

        await client.query(
            `INSERT INTO skill_path_reels (path_id, reel_id, "order", added_at)
             VALUES ${rows.join(", ")}`,
            values,
        );
    }

    // =========================================================================
    // DB - Enrolment writes
    // =========================================================================

    /**
     * Creates a new enrolment row for a user+path pair.
     * Caller has already confirmed no existing enrolment exists.
     *
     * @param userId  User UUID.
     * @param pathId  Skill path UUID.
     */
    async createEnrolment(userId: string, pathId: string): Promise<void> {
        await this.db.query(
            `INSERT INTO user_skill_paths
               (id, user_id, path_id, status, progress_count, enrolled_at, updated_at)
             VALUES
               ($1, $2, $3, 'in_progress', 0, now(), now())`,
            [uuidv7(), userId, pathId],
        );
    }

    /**
     * Partially updates an enrolment row. Only columns present in `data`
     * are updated - this is enforced by building the SET clause dynamically
     * rather than using COALESCE, which cannot distinguish "omitted" from
     * "explicitly set to null" for the completed_at column.
     *
     * Used in two contexts from the subscriber:
     *   1. Mid-path progress increment: { progress_count }
     *      -> Only progress_count and updated_at change. completed_at is untouched.
     *   2. Path completion: { status, progress_count, completed_at, certificate_url }
     *      -> All four fields change. completed_at is set to the completion timestamp.
     *
     * resetEnrolment (re-enrol) uses a direct transaction query instead of this
     * method, because it must atomically delete progress rows AND reset the
     * enrolment - two operations that cannot be combined in a single UPDATE.
     *
     * @param userId  User UUID.
     * @param pathId  Skill path UUID.
     * @param data    Partial update - only provided keys are written.
     */
    async updateEnrolment(
        userId: string,
        pathId: string,
        data: UpdateEnrolmentData,
    ): Promise<void> {
        // Build SET clause dynamically - only include columns that are present
        // in the data object. This is the only safe approach when one of the
        // columns (completed_at) needs to distinguish null from omitted.
        const sets: string[] = [];
        const params: unknown[] = [userId, pathId];

        if (data.status !== undefined) {
            params.push(data.status);
            sets.push(`status = $${params.length}`);
        }

        if (data.progress_count !== undefined) {
            params.push(data.progress_count);
            sets.push(`progress_count = $${params.length}`);
        }

        if (data.completed_at !== undefined) {
            // Explicit null is valid here (would be used if we ever needed to
            // clear completed_at outside of resetEnrolment - kept for completeness).
            params.push(data.completed_at);
            sets.push(`completed_at = $${params.length}`);
        }

        if (data.certificate_url !== undefined) {
            params.push(data.certificate_url);
            sets.push(`certificate_url = $${params.length}`);
        }

        // Nothing to update - should not happen in practice but guard defensively
        if (sets.length === 0) return;

        sets.push("updated_at = now()");

        await this.db.query(
            `UPDATE user_skill_paths
             SET    ${sets.join(", ")}
             WHERE  user_id = $1
               AND  path_id = $2`,
            params,
        );
    }

    /**
     * Hard-deletes the enrolment row.
     * Called on unenrol. The user_skill_path_progress rows are deleted
     * separately via deleteProgress.
     *
     * @param userId  User UUID.
     * @param pathId  Skill path UUID.
     */
    async deleteEnrolment(userId: string, pathId: string): Promise<void> {
        await this.db.query(
            `DELETE FROM user_skill_paths WHERE user_id = $1 AND path_id = $2`,
            [userId, pathId],
        );
    }

    /**
     * Resets a completed enrolment for re-enrolment in a single transaction.
     * Atomically:
     *   1. Hard-deletes all progress rows for the user+path (fresh start)
     *   2. Resets the enrolment to in_progress with 0 progress_count
     *
     * Wrapped in a transaction because both operations must succeed together.
     * A crash between them would leave the user with a reset enrolment but
     * stale progress rows, causing the next completion check to mis-count.
     *
     * @param userId  User UUID.
     * @param pathId  Skill path UUID.
     */
    async resetEnrolment(userId: string, pathId: string): Promise<void> {
        await this.db.withTransaction(async (client) => {
            await client.query(
                `DELETE FROM user_skill_path_progress WHERE user_id = $1 AND path_id = $2`,
                [userId, pathId],
            );

            await client.query(
                `UPDATE user_skill_paths
                 SET    status         = 'in_progress',
                        progress_count = 0,
                        completed_at   = NULL,
                        updated_at     = now()
                 WHERE  user_id = $1 AND path_id = $2`,
                [userId, pathId],
            );
        });
    }

    // =========================================================================
    // DB - Progress writes
    // =========================================================================

    /**
     * Records a reel as completed for a user in a path.
     * ON CONFLICT DO NOTHING enforces idempotency at the DB level - if the
     * same watch event is processed twice, the second call is a no-op.
     *
     * @param userId  User UUID.
     * @param pathId  Skill path UUID.
     * @param reelId  Reel UUID.
     * @returns true if a new row was inserted, false if it was a conflict (already counted).
     */
    async recordReelProgress(
        userId: string,
        pathId: string,
        reelId: string,
    ): Promise<boolean> {
        const result = await this.db.query(
            `INSERT INTO user_skill_path_progress (user_id, path_id, reel_id, watched_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (user_id, path_id, reel_id) DO NOTHING
             RETURNING user_id`,
            [userId, pathId, reelId],
        );
        return (result.rowCount ?? 0) > 0;
    }

    /**
     * Hard-deletes all progress rows for a user in a path.
     * Called on unenrol and on re-enrol reset (via resetEnrolment transaction).
     *
     * @param userId  User UUID.
     * @param pathId  Skill path UUID.
     */
    async deleteProgress(userId: string, pathId: string): Promise<void> {
        await this.db.query(
            `DELETE FROM user_skill_path_progress WHERE user_id = $1 AND path_id = $2`,
            [userId, pathId],
        );
    }

    // =========================================================================
    // Cache - Path list
    // =========================================================================

    /**
     * Returns the cached path list for a given cache key, or null on miss.
     *
     * @param cacheKey e.g. 'skill-paths:list:all' or 'skill-paths:list:beginner'
     * @returns Parsed SkillPath[] or null.
     */
    async getCachedPathList(cacheKey: string): Promise<SkillPath[] | null> {
        return this.cacheGet<SkillPath[]>(cacheKey);
    }

    /**
     * Caches the path list for a given cache key.
     *
     * @param cacheKey  Full Redis key including difficulty suffix.
     * @param paths     SkillPath[] to serialise and store.
     */
    async setCachedPathList(
        cacheKey: string,
        paths: SkillPath[],
    ): Promise<void> {
        await this.cacheSet(cacheKey, paths, SKILL_PATH_CACHE_TTL.PATH_LIST);
    }

    /**
     * Invalidates all path list cache variants (all + each difficulty).
     * Called after createPath, updatePath, and softDeletePath.
     */
    async invalidatePathListCache(): Promise<void> {
        const keys = [
            `${SKILL_PATH_REDIS_KEYS.PATH_LIST}:all`,
            ...SKILL_PATH_DIFFICULTIES.map(
                (d) => `${SKILL_PATH_REDIS_KEYS.PATH_LIST}:${d}`,
            ),
        ];
        await this.redis.del(...keys);
    }

    // =========================================================================
    // Cache - Single path by ID
    // =========================================================================

    /**
     * Returns a cached single path row, or null on miss.
     *
     * @param pathId Skill path UUID.
     * @returns Parsed SkillPath or null.
     */
    async getCachedPathById(pathId: string): Promise<SkillPath | null> {
        return this.cacheGet<SkillPath>(
            `${SKILL_PATH_REDIS_KEYS.PATH_BY_ID}:${pathId}`,
        );
    }

    /**
     * Caches a single path row. Never caches null.
     *
     * @param path SkillPath to store.
     */
    async setCachedPathById(path: SkillPath): Promise<void> {
        await this.cacheSet(
            `${SKILL_PATH_REDIS_KEYS.PATH_BY_ID}:${path.id}`,
            path,
            SKILL_PATH_CACHE_TTL.PATH_BY_ID,
        );
    }

    /**
     * Invalidates the single-path cache entry.
     * Called after updatePath and softDeletePath.
     *
     * @param pathId Skill path UUID.
     */
    async invalidatePathByIdCache(pathId: string): Promise<void> {
        await this.redis.del(`${SKILL_PATH_REDIS_KEYS.PATH_BY_ID}:${pathId}`);
    }

    // =========================================================================
    // Cache - User enrolments
    // =========================================================================

    /**
     * Returns cached enrolments for a user, or null on miss.
     * Short TTL (60s) - enrolment state changes frequently.
     *
     * @param userId User UUID.
     * @returns Parsed EnrolledPath[] or null.
     */
    async getCachedEnrolments(userId: string): Promise<EnrolledPath[] | null> {
        return this.cacheGet<EnrolledPath[]>(
            `${SKILL_PATH_REDIS_KEYS.ENROLMENTS}:${userId}`,
        );
    }

    /**
     * Caches the enrolment list for a user.
     *
     * @param userId      User UUID.
     * @param enrolments  EnrolledPath[] to store.
     */
    async setCachedEnrolments(
        userId: string,
        enrolments: EnrolledPath[],
    ): Promise<void> {
        await this.cacheSet(
            `${SKILL_PATH_REDIS_KEYS.ENROLMENTS}:${userId}`,
            enrolments,
            SKILL_PATH_CACHE_TTL.ENROLMENTS,
        );
    }

    /**
     * Invalidates the user enrolments cache.
     * Called after enrol, unenrol, and on progress completion update.
     *
     * @param userId User UUID.
     */
    async invalidateEnrolmentsCache(userId: string): Promise<void> {
        await this.redis.del(`${SKILL_PATH_REDIS_KEYS.ENROLMENTS}:${userId}`);
    }
}
