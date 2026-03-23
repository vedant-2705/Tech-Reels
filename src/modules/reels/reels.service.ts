/**
 * @module modules/reels/reels.service
 * @description
 * Application service implementing all Reels use cases:
 * upload initiation, confirm, update, delete, feed, watch telemetry,
 * likes, saves, reports, and admin operations.
 *
 * Cache strategy:
 *   reel:meta:{reelId}      - Redis Hash, TTL 300s
 *   reel:pending:{reelId}   - Redis String, TTL 1800s
 *   reel_tags:tag:{tagId}   - Redis Set, no TTL
 *   watched:{userId}        - Redis Bloom Filter, TTL 30 days
 *   feed:{userId}           - Redis List, TTL 1800s (Feed module writes, Reels reads)
 *
 * Pub/Sub events published:
 *   content_events    - REEL_DELETED, REEL_STATUS_CHANGED
 *   user_interactions - REEL_LIKED, REEL_UNLIKED, REEL_SAVED, REEL_UNSAVED
 *   video_telemetry   - REEL_WATCH_ENDED
 *   feed_events       - FEED_LOW
 */

import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";

import { ReelsRepository } from "./reels.repository";
import { RedisService } from "@redis/redis.service";
import { S3Service } from "@s3/s3.service";

import { CreateReelDto } from "./dto/create-reel.dto";
import { ConfirmReelDto } from "./dto/confirm-reel.dto";
import { UpdateReelDto } from "./dto/update-reel.dto";
import { WatchReelDto } from "./dto/watch-reel.dto";
import { ReportReelDto } from "./dto/report-reel.dto";
import { AdminUpdateStatusDto } from "./dto/admin-update-status.dto";
import { MyReelsQueryDto } from "./dto/my-reels-query.dto";
import { FeedQueryDto } from "./dto/feed-query.dto";
import { AdminGetReelsDto } from "./dto/admin-get-reels.dto";

import { CreateReelResponseDto } from "./dto/create-reel-response.dto";
import { ReelResponseDto } from "./dto/reel-response.dto";
import { FeedResponseDto, FeedItemDto } from "./dto/feed-response.dto";
import { MyReelsPaginatedResponseDto } from "./dto/my-reels-paginated-response.dto";
import { AdminReelsPaginatedResponseDto } from "./dto/admin-reels-paginated-response.dto";
import { AdminStatusUpdateResponseDto } from "./dto/admin-status-update-response.dto";

import { Reel, ReelMeta } from "./entities/reel.entity";
import {
    FEED_LOW_THRESHOLD,
    REEL_EDITABLE_STATUSES,
    REEL_META_FIELD,
    REEL_STATUS,
    REELS_ACCEPTED_MIME,
    REELS_LOCKS,
    REELS_MAX_UPLOAD_BYTES,
    REELS_MESSAGES,
    REELS_MODULE_CONSTANTS,
    REELS_PRESIGN_EXPIRES_IN,
    REELS_QUEUE_JOBS,
    REELS_S3_ENV,
} from "./reels.constants";
import { QUEUES } from "@queues/queue-names";

import { ReelNotFoundException } from "./exceptions/reel-not-found.exception";
import { InvalidReelKeyException } from "./exceptions/invalid-reel-key.exception";
import { InvalidReelTagsException } from "./exceptions/invalid-reel-tags.exception";

import { TAGS_REDIS_KEYS } from "@modules/tags/tags.constants";
import { MessageResponseDto } from "@common/dto/message-response.dto";
import { UploadInProgressException } from "./exceptions/upload-in-progress.exception";
import { uuidv7 } from "@common/utils/uuidv7.util";
import { buildReelUploadKey } from "./utils/build-reel-upload-key.util";

/**
 * Orchestrates all Reels workflows, side effects, and cache management.
 */
@Injectable()
export class ReelsService {
    private readonly logger = new Logger(ReelsService.name);

    /**
     * @param reelsRepository Reels data-access and cache layer.
     * @param redis Redis pub/sub and cache client.
     * @param s3Service S3 presigned URL and object existence checks.
     * @param config Runtime configuration provider.
     * @param videoProcessingQueue BullMQ queue for video processing jobs.
     * @param feedBuildQueue BullMQ queue for feed build jobs.
     */
    constructor(
        private readonly reelsRepository: ReelsRepository,
        private readonly redis: RedisService,
        private readonly s3Service: S3Service,
        private readonly config: ConfigService,
        @InjectQueue(QUEUES.VIDEO_PROCESSING)
        private readonly videoProcessingQueue: Queue,
        @InjectQueue(QUEUES.FEED_BUILD)
        private readonly feedBuildQueue: Queue,
    ) {}

    // Endpoint 1 - POST /reels

    /**
     * Initiate a reel upload: validate tags, insert reel row, generate presigned S3 PUT URL.
     *
     * @param userId Authenticated creator's user UUID.
     * @param dto Create reel payload.
     * @returns Presigned upload URL, reel ID, raw S3 key, and expiry timestamp.
     */
    async createReel(
        userId: string,
        dto: CreateReelDto,
    ): Promise<CreateReelResponseDto> {
        const lockKey = `${REELS_LOCKS.UPLOAD_PREFIX}:${userId}`;

        // Acquire distributed lock - prevents duplicate simultaneous uploads
        const acquired = await this.redis.setNx(
            lockKey,
            "1",
            REELS_LOCKS.UPLOAD_TTL,
        );
        if (!acquired) {
            throw new UploadInProgressException();
        }

        try {
            // Validate tag IDs exist
            const validIds = await this.reelsRepository.validateTagIds(
                dto.tag_ids,
            );
            if (validIds.length !== dto.tag_ids.length) {
                throw new InvalidReelTagsException();
            }

            // Derive S3 key and generate presigned PUT URL.
            // bucket is the second arg to generatePresignedPutUrl - not part of PresignedPutUrlOptions.
            // generatePresignedPutUrl returns { upload_url, expires_at } - destructure directly.
            const reelId = uuidv7();
            const rawKey = buildReelUploadKey(userId, reelId);
            const rawBucket =
                this.config.get<string>(REELS_S3_ENV.RAW_BUCKET) ?? "";

            const { upload_url, expires_at } =
                await this.s3Service.generatePresignedPutUrl(
                    {
                        key: rawKey,
                        contentType: REELS_ACCEPTED_MIME,
                        maxSizeBytes: REELS_MAX_UPLOAD_BYTES,
                        expiresIn: REELS_PRESIGN_EXPIRES_IN,
                    },
                    rawBucket,
                );

            // Store full draft in Redis - DB write deferred until confirm
            await this.reelsRepository.setDraft(reelId, {
                creatorId: userId,
                title: dto.title,
                description: dto.description,
                difficulty: dto.difficulty,
                tagIds: dto.tag_ids,
                rawKey,
            });

            return { reel_id: reelId, upload_url, raw_key: rawKey, expires_at };
        } finally {
            // Always release the lock - even if validation or S3 call throws
            await this.redis.del(lockKey);
        }
    }

    // Endpoint 2 - POST /reels/:id/confirm

    /**
     * Confirm a completed S3 upload and queue video processing.
     *
     * @param userId Authenticated creator's user UUID.
     * @param reelId Reel UUID from the route parameter.
     * @param dto Confirm payload containing raw_key.
     * @returns Reel ID, new status, and confirmation message.
     */
    async confirmReel(
        userId: string,
        reelId: string,
        dto: ConfirmReelDto,
    ): Promise<{ reel_id: string; status: string; message: string }> {
        // Read draft from Redis - null means expired or already confirmed
        const draft = await this.reelsRepository.getDraft(reelId);
        if (!draft) {
            throw new InvalidReelKeyException();
        }

        // Verify ownership - draft must belong to the calling user
        if (draft.creatorId !== userId) {
            throw new ReelNotFoundException();
        }

        // Verify raw_key matches what was issued at create time
        if (draft.rawKey !== dto.raw_key) {
            throw new InvalidReelKeyException();
        }

        // Verify the S3 object actually exists
        const rawBucket =
            this.config.get<string>(REELS_S3_ENV.RAW_BUCKET) ?? "";
        const exists = await this.s3Service.objectExists(
            dto.raw_key,
            rawBucket,
        );
        if (!exists) {
            throw new InvalidReelKeyException();
        }

        // Write reel row + tag associations in a single DB transaction
        await this.reelsRepository.createWithTags({
            id: reelId,
            creatorId: draft.creatorId,
            title: draft.title,
            description: draft.description,
            difficulty: draft.difficulty,
            tagIds: draft.tagIds,
        });

        // Delete draft - upload is now committed to DB
        await this.reelsRepository.deleteDraft(reelId);

        // Enqueue video processing job
        void this.videoProcessingQueue.add(REELS_QUEUE_JOBS.VIDEO_PROCESS, {
            reelId,
            rawKey: dto.raw_key,
            userId,
        });

        // TODO: REEL_CREATED pub/sub event is owned by the Media module.
        // It will be published by the Media webhook handler (POST /media/webhook)
        // when processing completes and reel status becomes active.
        // Do NOT publish REEL_CREATED here.

        return {
            reel_id: reelId,
            status: REEL_STATUS.PROCESSING,
            message: REELS_MESSAGES.CONFIRM,
        };
    }

    // Endpoint 3 - PATCH /reels/:id

    /**
     * Update mutable fields of a reel owned by the authenticated user.
     * If tag_ids are provided, all existing tags are replaced.
     * Only reels with status uploading | active | failed may be updated.
     *
     * @param userId Authenticated user UUID.
     * @param reelId Reel UUID from route parameter.
     * @param dto Partial update payload.
     * @returns Updated reel as ReelResponseDto.
     */
    async updateReel(
        userId: string,
        reelId: string,
        dto: UpdateReelDto,
    ): Promise<ReelResponseDto> {
        // Fetch and authorise
        const reel = await this.reelsRepository.findById(reelId);
        if (!reel) throw new ReelNotFoundException();
        if (reel.creator_id !== userId) throw new ForbiddenException();

        // Enforce editable status gate
        if (!REEL_EDITABLE_STATUSES.includes(reel.status as any)) {
            throw new ForbiddenException(
                `Reel with status '${reel.status}' cannot be edited`,
            );
        }

        // Validate new tag IDs if provided
        let newTagIds: string[] | undefined;
        let oldTags = reel.tags;

        if (dto.tag_ids) {
            const validIds = await this.reelsRepository.validateTagIds(
                dto.tag_ids,
            );
            if (validIds.length !== dto.tag_ids.length) {
                throw new InvalidReelTagsException();
            }
            newTagIds = dto.tag_ids;
        }

        // Persist scalar field updates
        const updated = await this.reelsRepository.update(reelId, {
            title: dto.title,
            description: dto.description,
            difficulty: dto.difficulty,
        });

        // Replace tags if provided
        if (newTagIds) {
            // Remove old tag IDs from Redis Sets (SREM)
            for (const tag of oldTags) {
                await this.reelsRepository.removeFromTagSet(tag.id, reelId);
            }

            // Replace DB tag associations
            await this.reelsRepository.deleteReelTags(reelId);
            await this.reelsRepository.insertReelTags(reelId, newTagIds);

            // Add new tag IDs to Redis Sets only if reel is active (SADD)
            if (reel.status === REEL_STATUS.ACTIVE) {
                for (const tagId of newTagIds) {
                    await this.reelsRepository.addToTagSet(tagId, reelId);
                }
            }

            // Invalidate tags cache (reel counts changed)
            await this.invalidateTagsCache();
        }

        // Invalidate reel meta cache
        await this.reelsRepository.deleteMetaCache(reelId);

        // Re-fetch with full joins to build response
        const fresh = await this.reelsRepository.findById(reelId);
        return this.toReelResponseDto(fresh!);
    }

    // Endpoint 4 - DELETE /reels/:id

    /**
     * Soft-delete a reel owned by the authenticated user.
     *
     * @param userId Authenticated user UUID.
     * @param reelId Reel UUID from route parameter.
     * @returns Success message.
     */
    async deleteReel(
        userId: string,
        reelId: string,
    ): Promise<MessageResponseDto> {
        const reel = await this.reelsRepository.findById(reelId);
        if (!reel) throw new ReelNotFoundException();
        if (reel.creator_id !== userId) throw new ForbiddenException();

        // Soft delete in DB
        await this.reelsRepository.softDelete(reelId);

        // Evict meta cache
        await this.reelsRepository.deleteMetaCache(reelId);

        // Remove from tag sets in Redis (SREM)
        for (const tag of reel.tags) {
            await this.reelsRepository.removeFromTagSet(tag.id, reelId);
        }

        // Invalidate tags cache
        await this.invalidateTagsCache();

        // Publish REEL_DELETED event (fire and forget)
        void this.redis.publish(
            REELS_MODULE_CONSTANTS.CONTENT_EVENTS,
            JSON.stringify({
                event: REELS_MODULE_CONSTANTS.REEL_DELETED,
                reelId,
                userId,
                timestamp: new Date().toISOString(),
            }),
        );

        return { message: REELS_MESSAGES.DELETED };
    }

    // Endpoint 5 - GET /reels/me

    /**
     * Return a paginated list of the authenticated creator's own reels.
     * Returns all statuses (uploading, processing, active, failed, etc.).
     *
     * @param userId Authenticated user UUID.
     * @param query Cursor pagination and optional status filter.
     * @returns Paginated reel list with cursor metadata.
     */
    async getMyReels(
        userId: string,
        query: MyReelsQueryDto,
    ): Promise<MyReelsPaginatedResponseDto> {
        const limit = query.limit ?? 20;

        // Fetch limit+1 to determine has_more
        const rows = await this.reelsRepository.findByCreator(
            userId,
            limit,
            query.cursor,
            query.status,
        );

        const hasMore = rows.length > limit;
        const data = rows.slice(0, limit);

        return {
            data: data.map((r) => this.toReelResponseDto(r)),
            meta: {
                next_cursor: hasMore ? data[data.length - 1].id : null,
                has_more: hasMore,
                total: data.length,
            },
        };
    }

    // Endpoint 6 - GET /reels/feed

    /**
     * Return the authenticated user's personalised feed from Redis List cache.
     *
     * Cold cache (empty list): enqueues feed_build job and falls back to
     * active reels from DB. next_cursor returns 0 so the client retries
     * and hits the warm cache on the next call.
     *
     * Feed low threshold: when remaining items <= 15, publishes FEED_LOW
     * to feed_events channel (fire and forget). Never adds feed_build job
     * directly except on cold start.
     *
     * @param userId Authenticated user UUID.
     * @param query Integer cursor and limit.
     * @returns Paginated feed items with is_liked / is_saved flags.
     */
    async getFeed(
        userId: string,
        query: FeedQueryDto,
    ): Promise<FeedResponseDto> {
        const cursor = query.cursor ?? 0;
        const limit = query.limit ?? 10;

        // Check feed length for cold-start detection
        const feedLength = await this.reelsRepository.getFeedLength(userId);

        if (feedLength === 0) {
            // Cold start - enqueue rebuild and return DB fallback
            void this.feedBuildQueue.add(REELS_QUEUE_JOBS.FEED_COLD_START, {
                userId,
                reason: REELS_QUEUE_JOBS.FEED_COLD_START,
            });

            const fallbackReels = await this.reelsRepository.findActive(10);

            if (fallbackReels.length === 0) {
                return { data: [], meta: { next_cursor: 0, has_more: false } };
            }

            // Fetch is_liked / is_saved for fallback reels
            const fallbackIds = fallbackReels.map((r) => r.id);
            const [likedIds, savedIds] = await Promise.all([
                this.reelsRepository.bulkIsLiked(userId, fallbackIds),
                this.reelsRepository.bulkIsSaved(userId, fallbackIds),
            ]);
            const likedSet = new Set(likedIds);
            const savedSet = new Set(savedIds);

            const data: FeedItemDto[] = fallbackReels.map((r) => ({
                ...this.toReelResponseDto(r),
                is_liked: likedSet.has(r.id),
                is_saved: savedSet.has(r.id),
            }));

            // next_cursor = 0 so client retries from start once cache is warm
            return { data, meta: { next_cursor: 0, has_more: false } };
        }

        // Read feed slice from Redis List
        const reelIds = await this.reelsRepository.getFeedSlice(
            userId,
            cursor,
            cursor + limit - 1,
        );

        if (reelIds.length === 0) {
            return { data: [], meta: { next_cursor: cursor, has_more: false } };
        }

        // Check feed low threshold and publish FEED_LOW if needed
        const remaining = feedLength - (cursor + limit);
        if (remaining <= FEED_LOW_THRESHOLD) {
            void this.redis.publish(
                REELS_MODULE_CONSTANTS.FEED_EVENTS,
                JSON.stringify({
                    event: REELS_MODULE_CONSTANTS.FEED_LOW,
                    userId,
                    remaining,
                }),
            );
        }

        // Resolve reel metadata (cache-first, DB fallback per miss)
        const reels = await this.resolveReelMetas(reelIds);

        // Bulk fetch is_liked / is_saved
        const [likedIds, savedIds] = await Promise.all([
            this.reelsRepository.bulkIsLiked(userId, reelIds),
            this.reelsRepository.bulkIsSaved(userId, reelIds),
        ]);
        const likedSet = new Set(likedIds);
        const savedSet = new Set(savedIds);

        // Build response
        const data: FeedItemDto[] = reels.map((r) => ({
            ...r,
            is_liked: likedSet.has(r.id),
            is_saved: savedSet.has(r.id),
        }));

        return {
            data,
            meta: {
                next_cursor: cursor + reelIds.length,
                has_more: remaining > 0,
            },
        };
    }

    // Endpoint 7 - GET /reels/:id

    /**
     * Return a single reel by ID (public, unauthenticated).
     * Only active reels are visible - any other status returns 404.
     * Serves from reel:meta cache when warm; populates cache on miss.
     *
     * @param reelId Reel UUID from route parameter.
     * @returns ReelResponseDto for active reels.
     */
    async getReelById(reelId: string): Promise<ReelResponseDto> {
        // Try cache first
        const cached = await this.reelsRepository.getMetaFromCache(reelId);
        if (cached) {
            if (cached.status !== REEL_STATUS.ACTIVE)
                throw new ReelNotFoundException();
            return this.metaToResponseDto(cached);
        }

        // Cache miss - fetch from DB
        const reel = await this.reelsRepository.findById(reelId);
        if (!reel || reel.status !== REEL_STATUS.ACTIVE)
            throw new ReelNotFoundException();

        // Populate cache for future requests
        await this.reelsRepository.setMetaCache(reelId, reel);

        return this.toReelResponseDto(reel);
    }

    // Endpoint 8 - POST /reels/:id/watch

    /**
     * Record a watch event for a reel. Returns 204 immediately.
     * All side effects (DB write, Bloom filter, view count) are async
     * via the REEL_WATCH_ENDED pub/sub event - nothing is awaited.
     *
     * BF.ADD and HINCRBY are performed here as fire-and-forget side effects
     * via the pub/sub subscriber. The Reels module publishes the event only.
     *
     * @param userId Authenticated user UUID.
     * @param reelId Reel UUID from route parameter.
     * @param dto Watch telemetry payload.
     * @returns void (controller sends 204).
     */
    async watchReel(
        userId: string,
        reelId: string,
        dto: WatchReelDto,
    ): Promise<void> {
        // Verify reel exists (404 if not)
        const reel = await this.reelsRepository.findById(reelId);
        if (!reel) throw new ReelNotFoundException();

        // Publish REEL_WATCH_ENDED - all side effects handled by async subscriber
        // BF.ADD watched:{userId} reelId - done by subscriber
        // HINCRBY reel:meta:{reelId} view_count 1 - done by subscriber
        // INSERT INTO user_reel_interaction - done by subscriber
        void this.redis.publish(
            REELS_MODULE_CONSTANTS.VIDEO_TELEMETRY,
            JSON.stringify({
                event: REELS_MODULE_CONSTANTS.REEL_WATCH_ENDED,
                userId,
                reelId,
                watch_duration_secs: dto.watch_duration_secs,
                completion_pct: dto.completion_pct,
                timestamp: new Date().toISOString(),
            }),
        );
    }

    // Endpoints 9–10 - Like / Unlike

    /**
     * Like a reel. Silently idempotent (ON CONFLICT DO NOTHING).
     *
     * @param userId Authenticated user UUID.
     * @param reelId Reel UUID.
     * @returns liked flag.
     */
    async likeReel(
        userId: string,
        reelId: string,
    ): Promise<{ liked: boolean }> {
        const reel = await this.reelsRepository.findById(reelId);
        if (!reel || reel.status !== REEL_STATUS.ACTIVE)
            throw new ReelNotFoundException();

        const inserted = await this.reelsRepository.like(userId, reelId);
        if (inserted) {
            await this.reelsRepository.incrMetaCount(
                reelId,
                REEL_META_FIELD.LIKE_COUNT,
                1,
            );
        }

        void this.redis.publish(
            REELS_MODULE_CONSTANTS.USER_INTERACTIONS,
            JSON.stringify({
                event: REELS_MODULE_CONSTANTS.REEL_LIKED,
                userId,
                reelId,
                tags: reel.tags.map((t) => t.id),
            }),
        );

        return { liked: true };
    }

    /**
     * Remove a like from a reel.
     *
     * @param userId Authenticated user UUID.
     * @param reelId Reel UUID.
     * @returns liked flag set to false.
     */
    async unlikeReel(
        userId: string,
        reelId: string,
    ): Promise<{ liked: boolean }> {
        const reel = await this.reelsRepository.findById(reelId);
        if (!reel || reel.status !== REEL_STATUS.ACTIVE)
            throw new ReelNotFoundException();

        const deleted = await this.reelsRepository.unlike(userId, reelId);
        if (deleted) {
            await this.reelsRepository.incrMetaCount(
                reelId,
                REEL_META_FIELD.LIKE_COUNT,
                -1,
            );
        }

        void this.redis.publish(
            REELS_MODULE_CONSTANTS.USER_INTERACTIONS,
            JSON.stringify({
                event: REELS_MODULE_CONSTANTS.REEL_UNLIKED,
                userId,
                reelId,
            }),
        );

        return { liked: false };
    }

    // Endpoints 11–12 - Save / Unsave

    /**
     * Save a reel. Silently idempotent.
     *
     * @param userId Authenticated user UUID.
     * @param reelId Reel UUID.
     * @returns saved flag.
     */
    async saveReel(
        userId: string,
        reelId: string,
    ): Promise<{ saved: boolean }> {
        const reel = await this.reelsRepository.findById(reelId);
        if (!reel) throw new ReelNotFoundException();

        const inserted = await this.reelsRepository.save(userId, reelId);
        if (inserted) {
            await this.reelsRepository.incrMetaCount(
                reelId,
                REEL_META_FIELD.SAVE_COUNT,
                1,
            );
        }

        void this.redis.publish(
            REELS_MODULE_CONSTANTS.USER_INTERACTIONS,
            JSON.stringify({
                event: REELS_MODULE_CONSTANTS.REEL_SAVED,
                userId,
                reelId,
            }),
        );

        return { saved: true };
    }

    /**
     * Remove a saved reel.
     *
     * @param userId Authenticated user UUID.
     * @param reelId Reel UUID.
     * @returns saved flag set to false.
     */
    async unsaveReel(
        userId: string,
        reelId: string,
    ): Promise<{ saved: boolean }> {
        const reel = await this.reelsRepository.findById(reelId);
        if (!reel) throw new ReelNotFoundException();

        const deleted = await this.reelsRepository.unsave(userId, reelId);
        if (deleted) {
            await this.reelsRepository.incrMetaCount(
                reelId,
                REEL_META_FIELD.SAVE_COUNT,
                -1,
            );
        }

        void this.redis.publish(
            REELS_MODULE_CONSTANTS.USER_INTERACTIONS,
            JSON.stringify({
                event: REELS_MODULE_CONSTANTS.REEL_UNSAVED,
                userId,
                reelId,
            }),
        );

        return { saved: false };
    }

    // Endpoint 13 - POST /reels/:id/report

    /**
     * Submit a report for a reel. One report per user per reel (silent dedup).
     *
     * @param userId Authenticated reporter user UUID.
     * @param reelId Reported reel UUID.
     * @param dto Report payload.
     * @returns Success message.
     */
    async reportReel(
        userId: string,
        reelId: string,
        dto: ReportReelDto,
    ): Promise<MessageResponseDto> {
        const reel = await this.reelsRepository.findById(reelId);
        if (!reel) throw new ReelNotFoundException();

        await this.reelsRepository.insertReport(
            userId,
            reelId,
            dto.reason,
            dto.details,
        );

        return { message: REELS_MESSAGES.REPORT_SUBMITTED };
    }

    // Endpoint 14 - PATCH /reels/:id/status (Admin)

    /**
     * Admin: update reel status. Manages tag set membership in Redis and
     * invalidates reel meta cache.
     *
     * status -> active:      SADD reel to each tag's Redis Set.
     * status -> disabled:    SREM reel from each tag's Redis Set.
     * status -> needs_review: no tag set change (reel stays in sets).
     *
     * @param reelId Reel UUID.
     * @param dto Admin status update payload.
     * @returns Updated reel id, status, and updated_at.
     */
    async adminUpdateStatus(
        reelId: string,
        dto: AdminUpdateStatusDto,
    ): Promise<AdminStatusUpdateResponseDto> {
        const reel = await this.reelsRepository.findById(reelId);
        if (!reel) throw new ReelNotFoundException();

        // Persist status change
        const updated = await this.reelsRepository.updateStatus(
            reelId,
            dto.status,
        );

        // Evict meta cache
        await this.reelsRepository.deleteMetaCache(reelId);

        // Manage Redis tag sets based on new status
        if (dto.status === REEL_STATUS.ACTIVE) {
            for (const tag of reel.tags) {
                await this.reelsRepository.addToTagSet(tag.id, reelId);
            }
            // New active reel - invalidate tags cache (reel_count changed)
            await this.invalidateTagsCache();
        } else if (dto.status === REEL_STATUS.DISABLED) {
            for (const tag of reel.tags) {
                await this.reelsRepository.removeFromTagSet(tag.id, reelId);
            }
            // Reel removed from active pool - invalidate tags cache
            await this.invalidateTagsCache();
        }
        // needs_review: no tag set change

        // Publish REEL_STATUS_CHANGED (fire and forget)
        void this.redis.publish(
            REELS_MODULE_CONSTANTS.CONTENT_EVENTS,
            JSON.stringify({
                event: REELS_MODULE_CONSTANTS.REEL_STATUS_CHANGED,
                reelId,
                status: dto.status,
                timestamp: new Date().toISOString(),
            }),
        );

        return {
            id: updated.id,
            status: updated.status,
            updated_at: updated.updated_at,
        };
    }

    // Endpoint 15 - GET /reels/admin (Admin)

    /**
     * Admin: list all reels with optional filtering. Supports cursor pagination.
     *
     * @param query Admin list query params (status, creator_id, cursor, limit).
     * @returns Paginated reel list with cursor metadata.
     */
    async adminGetReels(
        query: AdminGetReelsDto,
    ): Promise<AdminReelsPaginatedResponseDto> {
        const limit = query.limit ?? 20;

        const rows = await this.reelsRepository.findAllAdmin(
            limit,
            query.cursor,
            query.status,
            query.creator_id,
        );

        const hasMore = rows.length > limit;
        const data = rows.slice(0, limit);

        return {
            data: data.map((r) => this.toReelResponseDto(r)),
            meta: {
                next_cursor: hasMore ? data[data.length - 1].id : null,
                has_more: hasMore,
            },
        };
    }

    // Private helpers

    /**
     * Resolve a list of reel IDs into ReelResponseDtos.
     * For each ID: try reel:meta cache first, fall back to DB on miss,
     * then populate cache. Results maintain input order.
     *
     * @param reelIds Ordered array of reel UUIDs.
     * @returns Ordered array of ReelResponseDtos (may be shorter if DB misses).
     */
    private async resolveReelMetas(
        reelIds: string[],
    ): Promise<ReelResponseDto[]> {
        const results: ReelResponseDto[] = [];

        for (const id of reelIds) {
            const cached = await this.reelsRepository.getMetaFromCache(id);
            if (cached) {
                results.push(this.metaToResponseDto(cached));
                continue;
            }

            // Cache miss - fetch from DB and repopulate
            const reel = await this.reelsRepository.findById(id);
            if (reel && reel.status === REEL_STATUS.ACTIVE) {
                await this.reelsRepository.setMetaCache(id, reel);
                results.push(this.toReelResponseDto(reel));
            }
            // Silently skip non-active or deleted reels
        }

        return results;
    }

    /**
     * Map a full Reel entity to the public ReelResponseDto shape.
     *
     * @param reel Reel entity from DB.
     * @returns ReelResponseDto.
     */
    private toReelResponseDto(reel: Reel): ReelResponseDto {
        return {
            id: reel.id,
            title: reel.title,
            description: reel.description,
            hls_path: reel.hls_path,
            thumbnail_key: reel.thumbnail_key,
            duration_seconds: reel.duration_seconds,
            status: reel.status,
            difficulty: reel.difficulty,
            view_count: Number(reel.view_count),
            like_count: Number(reel.like_count),
            save_count: Number(reel.save_count),
            share_count: Number(reel.share_count),
            creator: {
                id: reel.creator_id,
                username: reel.username,
                avatar_url: reel.avatar_url,
            },
            tags: Array.isArray(reel.tags) ? reel.tags : [],
            created_at: reel.created_at,
            updated_at: reel.updated_at,
        };
    }

    /**
     * Map a Redis Hash ReelMeta to the public ReelResponseDto shape.
     * Parses stringified numeric fields from Redis storage.
     *
     * @param meta ReelMeta from Redis Hash.
     * @returns ReelResponseDto.
     */
    private metaToResponseDto(meta: ReelMeta): ReelResponseDto {
        let tags = [];
        try {
            tags = JSON.parse(meta.tags ?? "[]");
        } catch {
            this.logger.warn(
                `Failed to parse tags from cache for reel ${meta.id}`,
            );
        }

        return {
            id: meta.id,
            title: meta.title,
            description: meta.description || null,
            hls_path: meta.hls_path || null,
            thumbnail_key: meta.thumbnail_key || null,
            duration_seconds: meta.duration_seconds
                ? parseInt(meta.duration_seconds, 10)
                : null,
            status: meta.status,
            difficulty: meta.difficulty,
            view_count: parseInt(meta.view_count, 10),
            like_count: parseInt(meta.like_count, 10),
            save_count: parseInt(meta.save_count, 10),
            share_count: parseInt(meta.share_count, 10),
            creator: {
                id: meta.creator_id,
                username: meta.username,
                avatar_url: meta.avatar_url || null,
            },
            tags,
            created_at: meta.created_at,
            updated_at: meta.updated_at,
        };
    }

    /**
     * Invalidate tags cache keys owned by the Tags module.
     * Called when reel becomes active or is deleted - reel_count changes.
     *
     * @returns void
     */
    private async invalidateTagsCache(): Promise<void> {
        try {
            await this.redis.del(TAGS_REDIS_KEYS.ALL);
            // Individual category keys use pattern deletion
            await this.redis.deletePattern(
                `${TAGS_REDIS_KEYS.CATEGORY_PREFIX}:*`,
            );
        } catch (err) {
            this.logger.warn(
                `Tags cache invalidation failed: ${(err as Error).message}`,
            );
        }
    }
}
