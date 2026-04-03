/**
 * @module modules/skill-paths/skill-paths.service
 * @description
 * Application service for the Skill Paths module.
 * Owns all business logic and cache-aside orchestration.
 *
 * Cache-aside pattern per operation:
 *   getPaths:       cache(list)      -> miss -> DB -> set cache -> merge enrolments
 *   getPathById:    cache(path)      -> miss -> DB -> set cache -> fetch reels + progress
 *   enrol:          cache(path)      -> miss -> DB -> set cache -> write enrolment -> invalidate enrolments cache
 *   getProgress:    cache(path)      -> miss -> DB -> set cache -> getEnrolment -> getNextReel
 *   getEnrolled:    findEnrolledByUser (no path-level cache - user-specific join)
 *   createPath:     write DB + junction -> invalidate list cache
 *   updatePath:     write DB + optional junction -> invalidate id + list caches
 *   deletePath:     soft-delete DB -> invalidate id + list caches
 *
 * Never calls DatabaseService directly - all DB and cache ops go through repository.
 */

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";

import { SkillPathsService } from "./skill-paths.service.abstract";
import { SkillPathsRepository } from "./skill-paths.repository";
import { DatabaseService } from "@database/database.service";

import { CreatePathDto } from "./dto/create-path.dto";
import { UpdatePathDto } from "./dto/update-path.dto";
import { PathQueryDto } from "./dto/path-query.dto";

import { PathResponseDto } from "./dto/path-response.dto";
import {
    PathListResponseDto,
    PathListItemDto,
} from "./dto/path-list-response.dto";
import {
    PathDetailResponseDto,
    PathReelItemDto,
} from "./dto/path-detail-response.dto";
import { EnrolResponseDto } from "./dto/enrol-response.dto";
import { PathProgressResponseDto } from "./dto/path-progress-response.dto";
import { EnrolledPathsResponseDto } from "./dto/enrolled-paths-response.dto";

import { PathNotFoundException } from "./exceptions/path-not-found.exception";
import { AlreadyEnrolledException } from "./exceptions/already-enrolled.exception";
import { NotEnrolledException } from "./exceptions/not-enrolled.exception";
import { InvalidPathReelsException } from "./exceptions/invalid-path-reels.exception";

import { SkillPath } from "./entities/skill-path.entity";
import {
    SKILL_PATH_MESSAGES,
    SKILL_PATH_REDIS_KEYS,
    SKILL_PATH_STATUS,
} from "./skill-paths.constants";

import { QUEUES } from "@queues/queue-names";
import { uuidv7 } from "@common/utils/uuidv7.util";
import { MessageResponseDto } from "@common/dto/message-response.dto";

/**
 * Orchestrates all Skill Paths workflows: path CRUD, enrolment lifecycle,
 * progress reads, and cache management.
 */
@Injectable()
export class SkillPathsServiceImpl extends SkillPathsService {
    private readonly logger = new Logger(SkillPathsService.name);

    /** Base URL for CDN-hosted reel thumbnails. Used to convert thumbnail_key -> URL. */
    private readonly cdnBaseUrl: string;

    constructor(
        private readonly skillPathsRepository: SkillPathsRepository,
        private readonly db: DatabaseService,
        private readonly config: ConfigService,
    ) {
        super();
        this.cdnBaseUrl = this.config.get<string>("CDN_BASE_URL") ?? "";
    }

    // -------------------------------------------------------------------------
    // Endpoint 1 - GET /skill-paths
    // -------------------------------------------------------------------------

    /**
     *
     * Cache strategy:
     *   - The path list is cached WITHOUT user-specific enrolment data.
     *   - Enrolments are merged on every request from a separate fast lookup (getUserEnrolments). This avoids per-user cache entries for the list and keeps the cache simple and widely shared.
     *
     * @inheritdoc
     */
    async getPaths(
        userId: string,
        query: PathQueryDto,
    ): Promise<PathListResponseDto> {
        const limit = query.limit ?? 20;
        const cacheKey = `${SKILL_PATH_REDIS_KEYS.PATH_LIST}:${query.difficulty ?? "all"}`;

        // Path list - cache-aside (cache does NOT include cursor logic;
        // cursor filtering happens in the DB query)
        let paths = await this.skillPathsRepository.getCachedPathList(cacheKey);

        if (!paths) {
            // Fetch from DB with cursor/difficulty filters
            paths = await this.skillPathsRepository.findAll({
                difficulty: query.difficulty,
                cursor: query.cursor,
                limit: limit + 1,
            });
            // Only cache the first page (no cursor) - subsequent pages
            // are small and not worth polluting the cache with cursor-specific sets
            if (!query.cursor) {
                await this.skillPathsRepository.setCachedPathList(
                    cacheKey,
                    paths,
                );
            }
        } else {
            // Cache hit - apply cursor-based slicing in memory
            // (cache stores the first page, cursor slices from it)
            if (query.cursor) {
                const cursorIndex = paths.findIndex(
                    (p) => p.id === query.cursor,
                );
                paths = cursorIndex >= 0 ? paths.slice(cursorIndex + 1) : paths;
            }
            paths = paths.slice(0, limit + 1);
        }

        const hasMore = paths.length > limit;
        const page = paths.slice(0, limit);

        // Merge enrolment status
        const pathIds = page.map((p) => p.id);
        const enrolments = await this.skillPathsRepository.getUserEnrolments(
            userId,
            pathIds,
        );
        const enrolMap = new Map(enrolments.map((e) => [e.path_id, e]));

        const data: PathListItemDto[] = page.map((path) => {
            const enrolment = enrolMap.get(path.id);
            return {
                id: path.id,
                title: path.title,
                description: path.description,
                difficulty: path.difficulty,
                thumbnail_url: path.thumbnail_url,
                total_reels: path.total_reels,
                estimated_duration_minutes: path.estimated_duration_minutes,
                is_enrolled: !!enrolment,
                progress_count: enrolment?.progress_count ?? 0,
                status: enrolment?.status ?? null,
            };
        });

        return {
            data,
            meta: {
                next_cursor: hasMore ? page[page.length - 1].id : null,
                has_more: hasMore,
            },
        };
    }

    // -------------------------------------------------------------------------
    // Endpoint 2 - GET /skill-paths/me/enrolled
    // -------------------------------------------------------------------------

    /** @inheritdoc */
    async getEnrolled(userId: string): Promise<EnrolledPathsResponseDto> {
        const enrolments =
            await this.skillPathsRepository.findEnrolledByUser(userId);

        return {
            data: enrolments.map((e) => ({
                path_id: e.path_id,
                title: e.title,
                difficulty: e.difficulty,
                thumbnail_url: e.thumbnail_url,
                status: e.status,
                progress_count: e.progress_count,
                total_reels: e.total_reels,
                enrolled_at: e.enrolled_at,
                completed_at: e.completed_at,
            })),
        };
    }

    // -------------------------------------------------------------------------
    // Endpoint 3 - GET /skill-paths/:id
    // -------------------------------------------------------------------------

    /**
     * 
     * Cache strategy:
     *   - Path row: cache-aside (5 min TTL, shared across users)
     *   - Reel list: always fetched fresh - changes on admin update; list is small
     *   - User progress: always fetched fresh - changes on every watch event
     *
     * @inheritdoc
     */
    async getPathById(
        userId: string,
        pathId: string,
    ): Promise<PathDetailResponseDto> {
        // Path row - cache-aside
        const path = await this.resolvePathOrThrow(
            pathId,
            /* publishedOnly */ true,
        );

        // Reel list - always fresh (small, changes on admin update)
        const reels = await this.skillPathsRepository.getPathReels(pathId);

        // User progress - always fresh (changes on every qualifying watch event)
        const watchedIds = await this.skillPathsRepository.getUserProgress(
            userId,
            pathId,
        );
        const watchedSet = new Set(watchedIds);

        // Enrolment status for this specific path
        const enrolment = await this.skillPathsRepository.getEnrolment(
            userId,
            pathId,
        );

        const reelItems: PathReelItemDto[] = reels.map((reel) => ({
            order: reel.order,
            id: reel.id,
            title: reel.title,
            difficulty: reel.difficulty,
            thumbnail_url: this.thumbnailKeyToUrl(reel.thumbnail_key),
            duration: reel.duration,
            is_completed: watchedSet.has(reel.id),
            tags: reel.tags,
        }));

        return {
            id: path.id,
            title: path.title,
            description: path.description,
            difficulty: path.difficulty,
            thumbnail_url: path.thumbnail_url,
            total_reels: path.total_reels,
            estimated_duration_minutes: path.estimated_duration_minutes,
            is_enrolled: !!enrolment,
            progress_count: enrolment?.progress_count ?? 0,
            status: enrolment?.status ?? null,
            reels: reelItems,
        };
    }

    // -------------------------------------------------------------------------
    // Endpoint 4 - POST /skill-paths/:id/enrol
    // -------------------------------------------------------------------------

    /**
     *
     * Cases:
     *   - not enrolled  -> createEnrolment
     *   - in_progress   -> throw AlreadyEnrolledException
     *   - completed     -> re-enrol: resetEnrolment (atomic transaction)
     *
     * XP and badges are NOT re-awarded on re-enrolment. That logic lives in the subscriber (isFirstCompletion check). The enrol endpoint itself never touches XP/badge queues.
     *
     * @inheritdoc
     */
    async enrol(userId: string, pathId: string): Promise<EnrolResponseDto> {
        const path = await this.resolvePathOrThrow(
            pathId,
            /* publishedOnly */ true,
        );

        const existing = await this.skillPathsRepository.getEnrolment(
            userId,
            pathId,
        );

        if (existing) {
            if (existing.status === SKILL_PATH_STATUS.IN_PROGRESS) {
                throw new AlreadyEnrolledException();
            }
            // status = completed -> re-enrol: reset progress atomically
            await this.skillPathsRepository.resetEnrolment(userId, pathId);
        } else {
            // No existing enrolment -> fresh enrol
            await this.skillPathsRepository.createEnrolment(userId, pathId);
        }

        await this.skillPathsRepository.invalidateEnrolmentsCache(userId);

        // Fetch the fresh enrolment to get the accurate enrolled_at timestamp
        const fresh = await this.skillPathsRepository.getEnrolment(
            userId,
            pathId,
        );

        return {
            message: SKILL_PATH_MESSAGES.ENROLLED,
            path_id: pathId,
            enrolled_at: fresh!.enrolled_at,
        };
    }

    // -------------------------------------------------------------------------
    // Endpoint 5 - DELETE /skill-paths/:id/unenrol
    // -------------------------------------------------------------------------

    /**
     * 
     * Hard-deletes both the enrolment row and all progress rows.
     * This is intentional - unenrolling is a deliberate clean slate.
     *
     * @inheritdoc
     */
    async unenrol(userId: string, pathId: string): Promise<MessageResponseDto> {
        // findById (not cache) - unenrol must verify path existence independently
        // of published status (user may unenrol from a path that was just unpublished)
        const path = await this.skillPathsRepository.findById(pathId);
        if (!path) throw new PathNotFoundException();

        const enrolment = await this.skillPathsRepository.getEnrolment(
            userId,
            pathId,
        );
        if (!enrolment) throw new NotEnrolledException();

        // Delete both rows - order matters to avoid FK constraint issues
        // if a FK from progress -> enrolment were added later
        await this.skillPathsRepository.deleteProgress(userId, pathId);
        await this.skillPathsRepository.deleteEnrolment(userId, pathId);
        await this.skillPathsRepository.invalidateEnrolmentsCache(userId);

        return { message: SKILL_PATH_MESSAGES.UNENROLLED };
    }

    // -------------------------------------------------------------------------
    // Endpoint 6 - GET /skill-paths/:id/progress
    // -------------------------------------------------------------------------

    /** @inheritdoc */
    async getProgress(
        userId: string,
        pathId: string,
    ): Promise<PathProgressResponseDto> {
        const path = await this.resolvePathOrThrow(
            pathId,
            /* publishedOnly */ true,
        );

        const enrolment = await this.skillPathsRepository.getEnrolment(
            userId,
            pathId,
        );
        if (!enrolment) throw new NotEnrolledException();

        const percentage =
            path.total_reels > 0
                ? Math.round(
                      (enrolment.progress_count / path.total_reels) * 100,
                  )
                : 0;

        const next_reel =
            enrolment.status !== SKILL_PATH_STATUS.COMPLETED
                ? await this.skillPathsRepository.getNextReel(userId, pathId)
                : null;

        return {
            path_id: pathId,
            status: enrolment.status,
            progress_count: enrolment.progress_count,
            total_reels: path.total_reels,
            percentage,
            enrolled_at: enrolment.enrolled_at,
            completed_at: enrolment.completed_at,
            certificate_url: enrolment.certificate_url,
            next_reel: next_reel
                ? {
                      order: next_reel.order,
                      id: next_reel.id,
                      title: next_reel.title,
                  }
                : null,
        };
    }

    // -------------------------------------------------------------------------
    // Endpoint 7 - POST /skill-paths (Admin)
    // -------------------------------------------------------------------------

    /** @inheritdoc */
    async createPath(
        adminId: string,
        dto: CreatePathDto,
    ): Promise<PathResponseDto> {
        // Validate all reel IDs are active
        const validIds = await this.skillPathsRepository.validateReelIds(
            dto.reel_ids,
        );
        if (validIds.length !== dto.reel_ids.length) {
            throw new InvalidPathReelsException();
        }

        // Compute estimated duration from reel durations
        const totalSeconds =
            await this.skillPathsRepository.getReelsDurationSum(dto.reel_ids);
        const estimatedDurationMins = Math.ceil(totalSeconds / 60);

        const pathId = uuidv7();

        // Insert path row
        const created = await this.skillPathsRepository.createPath({
            id: pathId,
            title: dto.title,
            description: dto.description,
            difficulty: dto.difficulty,
            thumbnail_url: dto.thumbnail_url ?? null,
            total_reels: dto.reel_ids.length,
            estimated_duration_minutes: estimatedDurationMins,
            is_published: dto.is_published ?? false,
            created_by: adminId,
        });

        // Insert ordered reel list inside a transaction
        const client = await this.db.getClient();
        try {
            await client.query("BEGIN");
            await this.skillPathsRepository.setPathReels(
                pathId,
                dto.reel_ids,
                client,
            );
            await client.query("COMMIT");
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }

        // Invalidate path list cache (new path may appear in list)
        await this.skillPathsRepository.invalidatePathListCache();

        return {
            id: created.id,
            title: created.title,
            total_reels: created.total_reels,
            estimated_duration_minutes: created.estimated_duration_minutes,
            is_published: created.is_published,
            created_at: created.created_at,
        };
    }

    // -------------------------------------------------------------------------
    // Endpoint 8 - PATCH /skill-paths/:id (Admin)
    // -------------------------------------------------------------------------

    /** @inheritdoc */
    async updatePath(
        adminId: string,
        pathId: string,
        dto: UpdatePathDto,
    ): Promise<PathResponseDto> {
        // findById - admin can update unpublished paths
        const path = await this.skillPathsRepository.findById(pathId);
        if (!path) throw new PathNotFoundException();

        let totalReels: number | undefined;
        let estimatedDurationMins: number | undefined;

        if (dto.reel_ids) {
            // Validate new reel list
            const validIds = await this.skillPathsRepository.validateReelIds(
                dto.reel_ids,
            );
            if (validIds.length !== dto.reel_ids.length) {
                throw new InvalidPathReelsException();
            }

            // Recalculate duration
            const totalSeconds =
                await this.skillPathsRepository.getReelsDurationSum(
                    dto.reel_ids,
                );
            estimatedDurationMins = Math.ceil(totalSeconds / 60);
            totalReels = dto.reel_ids.length;

            // Replace reel list atomically
            const client = await this.db.getClient();
            try {
                await client.query("BEGIN");
                await this.skillPathsRepository.setPathReels(
                    pathId,
                    dto.reel_ids,
                    client,
                );
                await client.query("COMMIT");
            } catch (err) {
                await client.query("ROLLBACK");
                throw err;
            } finally {
                client.release();
            }
        }

        // Update path scalar fields
        const updated = await this.skillPathsRepository.updatePath(pathId, {
            title: dto.title,
            description: dto.description,
            difficulty: dto.difficulty,
            thumbnail_url: dto.thumbnail_url,
            is_published: dto.is_published,
            total_reels: totalReels,
            estimated_duration_minutes: estimatedDurationMins,
        });

        // Invalidate caches
        await this.skillPathsRepository.invalidatePathByIdCache(pathId);
        await this.skillPathsRepository.invalidatePathListCache();

        return {
            id: updated.id,
            title: updated.title,
            total_reels: updated.total_reels,
            estimated_duration_minutes: updated.estimated_duration_minutes,
            is_published: updated.is_published,
            updated_at: updated.updated_at,
        };
    }

    // -------------------------------------------------------------------------
    // Endpoint 9 - DELETE /skill-paths/:id (Admin)
    // -------------------------------------------------------------------------

    /** @inheritdoc */
    async deletePath(
        adminId: string,
        pathId: string,
    ): Promise<MessageResponseDto> {
        const path = await this.skillPathsRepository.findById(pathId);
        if (!path) throw new PathNotFoundException();

        await this.skillPathsRepository.softDeletePath(pathId);

        // Invalidate both caches - path disappears from list and detail
        await this.skillPathsRepository.invalidatePathByIdCache(pathId);
        await this.skillPathsRepository.invalidatePathListCache();

        this.logger.log(
            `Skill path soft-deleted: pathId=${pathId} by adminId=${adminId}`,
        );

        return { message: SKILL_PATH_MESSAGES.DELETED };
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Cache-aside path resolution with optional published-only enforcement.
     * Used by getPaths, getPathById, enrol, and getProgress - any endpoint
     * that needs the path row and should throw 404 for unpublished paths.
     *
     * Admin endpoints (updatePath, deletePath) call findById directly instead
     * because they need to access unpublished paths.
     *
     * @param pathId        Skill path UUID.
     * @param publishedOnly Whether to throw PathNotFoundException for unpublished paths.
     * @returns Resolved SkillPath.
     * @throws PathNotFoundException if not found or (when publishedOnly) not published.
     */
    private async resolvePathOrThrow(
        pathId: string,
        publishedOnly: boolean,
    ): Promise<SkillPath> {
        let path = await this.skillPathsRepository.getCachedPathById(pathId);

        if (!path) {
            path = await this.skillPathsRepository.findById(pathId);
            if (path) {
                await this.skillPathsRepository.setCachedPathById(path);
            }
        }

        if (!path || (publishedOnly && !path.is_published)) {
            throw new PathNotFoundException();
        }

        return path;
    }

    /**
     * Converts a raw S3 thumbnail_key to a full CDN URL.
     * Returns null if the key is null or empty.
     * CDN_BASE_URL is read once in the constructor.
     *
     * @param key Raw S3 thumbnail key from the reels table.
     * @returns Full CDN URL string or null.
     */
    thumbnailKeyToUrl(key: string | null): string | null {
        if (!key) return null;
        // Ensure no double-slash if cdnBaseUrl already has a trailing slash
        const base = this.cdnBaseUrl.replace(/\/$/, "");
        return `${base}/${key}`;
    }
}
