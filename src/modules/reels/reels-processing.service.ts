/**
 * @module modules/reels/reels-processing.service
 * @description
 * Thin service wrapping the two repository methods that the Media module
 * needs to call after MediaConvert processing completes.
 *
 * Exported from ReelsModule so Media module can import ReelsModule and
 * inject ReelsProcessingService - same pattern as AuthSessionService.
 *
 * The Media module MUST NOT inject ReelsRepository directly.
 */

import { Injectable, Logger } from "@nestjs/common";
import { ReelsRepository, ProcessingResultData } from "./reels.repository";
import { ReelTag } from "./entities/reel.entity";
import { RedisService } from "@redis/redis.service";
import {
    CHUNK_SIZE,
    REELS_CACHE_TTL,
    REELS_REDIS_KEYS,
} from "./reels.constants";

/**
 * Service exposing processing-pipeline integration points for the Media module.
 */
@Injectable()
export class ReelsProcessingService {
    private readonly logger = new Logger(ReelsProcessingService.name);
    /**
     * @param reelsRepository Reels data-access layer.
     */
    constructor(
        private readonly reelsRepository: ReelsRepository,
        private readonly redis: RedisService,
    ) {}

    /**
     * Persist the result of a MediaConvert processing job (complete or failed).
     * Called by Media module's webhook handler after EventBridge fires.
     *
     * @param reelId Reel UUID being updated.
     * @param data Processing result including new status, hls_path, thumbnail_key, duration.
     * @returns void
     */
    async setProcessingResult(
        reelId: string,
        data: ProcessingResultData,
    ): Promise<void> {
        return this.reelsRepository.setProcessingResult(reelId, data);
    }

    /**
     * Retrieve all tags associated with a reel from the database.
     * Used by the Media module after processing completes to populate
     * tag sets in Redis (SADD reel_tags:tag:{tagId}).
     *
     * @param reelId Reel UUID.
     * @returns Array of tag objects (id, name, category).
     */
    async getTagsForReel(reelId: string): Promise<ReelTag[]> {
        return this.reelsRepository.getTagsForReel(reelId);
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
            const reels = await this.reelsRepository.bulkFindByIds(chunkIds);

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
}
