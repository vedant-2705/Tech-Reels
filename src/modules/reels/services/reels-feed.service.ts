/**
 * @module modules/reels/services/reels-feed.service
 * @description
 * Handles the personalised feed pipeline:
 *   getFeed - cold start detection, LPOP from Redis, fallback, FEED_LOW pub/sub
 *   resolveReelMetas - cache-first ID -> ReelResponseDto resolution
 *   buildPersonalisedFallback - affinity candidates, BF filter, round-robin
 *   annotateReelsWithInteractions - bulk is_liked / is_saved annotation
 */

import { Injectable, Logger } from "@nestjs/common";

import { ReelsRepository } from "../reels.repository";
import { RedisService } from "@redis/redis.service";

import { FeedQueryDto } from "../dto/feed-query.dto";
import { FeedResponseDto, FeedItemDto } from "../dto/feed-response.dto";
import { ReelResponseDto } from "../dto/reel-response.dto";
import { Reel } from "../entities/reel.entity";

import { toReelResponseDto, metaToResponseDto } from "../reels.mapper";

import {
    FEED_LOW_THRESHOLD,
    REEL_STATUS,
    REELS_REDIS_KEYS,
} from "../reels.constants";
import { MessagingService } from "@modules/messaging";
import { REELS_MANIFEST } from "../reels.messaging";
import { FeedLowEventPayload } from "../reels.interface";
import { FeedFacade } from "@modules/feed";

@Injectable()
export class ReelsFeedService {
    private readonly logger = new Logger(ReelsFeedService.name);

    constructor(
        private readonly reelsRepository: ReelsRepository,
        private readonly redis: RedisService,
        private readonly messagingService: MessagingService,
        private readonly feedFacade: FeedFacade,
    ) {}

    /**
     * Serve the user's personalised feed.
     *
     * Cold cache (empty list): enqueues feed_build job and falls back to
     * active reels from DB. next_cursor returns 0 so the client retries
     * and hits the warm cache on the next call.
     *
     * Feed low threshold: when remaining items <= 15, publishes FEED_LOW
     * to feed_events channel (fire and forget).
     */
    async getFeed(
        userId: string,
        query: FeedQueryDto,
    ): Promise<FeedResponseDto> {
        const limit = query.limit ?? 10;

        const feedLength = await this.reelsRepository.getFeedLength(userId);

        if (feedLength === 0) {
            void this.feedFacade.feedColdStart(userId);

            const RETRY_COUNT = 3;
            const RETRY_DELAY_MS = 300;

            for (let i = 0; i < RETRY_COUNT; i++) {
                await new Promise<void>((res) =>
                    setTimeout(res, RETRY_DELAY_MS),
                );
                const length = await this.reelsRepository.getFeedLength(userId);
                if (length > 0) break;
            }

            const freshLength =
                await this.reelsRepository.getFeedLength(userId);

            if (freshLength > 0) {
                const ids = await this.reelsRepository.popFeedItems(
                    userId,
                    limit,
                );
                if (ids.length === 0) {
                    return {
                        data: [],
                        meta: { next_cursor: 0, has_more: false },
                    };
                }

                const remaining =
                    await this.reelsRepository.getFeedLength(userId);
                if (remaining <= FEED_LOW_THRESHOLD) {
                    const feedLowPayload: FeedLowEventPayload = {
                        userId,
                        remaining,
                    }
                    void this.messagingService.dispatchEvent(
                        REELS_MANIFEST.events.FEED_LOW.eventType,
                        feedLowPayload,
                    );
                }

                const reels = await this.resolveReelMetas(ids);
                const data = await this.annotateReelsWithInteractions(
                    userId,
                    reels,
                );
                const remainingLength =
                    await this.reelsRepository.getFeedLength(userId);
                return {
                    data,
                    meta: {
                        next_cursor: 0,
                        has_more: remainingLength > 0,
                    },
                };
            }

            this.logger.warn(
                `Feed worker did not finish in time for userId=${userId} - running synchronous fallback`,
            );
            return await this.buildPersonalisedFallback(userId, limit);
        }

        // Normal path - list has items, pop and serve
        const reelIds = await this.reelsRepository.popFeedItems(userId, limit);

        if (reelIds.length === 0) {
            return { data: [], meta: { next_cursor: 0, has_more: false } };
        }

        const remaining = await this.reelsRepository.getFeedLength(userId);
        if (remaining <= FEED_LOW_THRESHOLD) {
            const feedLowPayload: FeedLowEventPayload = {
                userId,
                remaining,
            };
            void this.messagingService.dispatchEvent(
                REELS_MANIFEST.events.FEED_LOW.eventType,
                feedLowPayload,
            );
        }

        const reels = await this.resolveReelMetas(reelIds);
        const data = await this.annotateReelsWithInteractions(userId, reels);

        return {
            data,
            meta: {
                next_cursor: 0,
                has_more: remaining > 0,
            },
        };
    }

    /**
     * Resolve a list of reel IDs into ReelResponseDtos.
     * For each ID: try reel:meta cache first, fall back to DB on miss,
     * then populate cache. Results maintain input order.
     */
    async resolveReelMetas(
        reelIds: string[],
    ): Promise<ReelResponseDto[]> {
        const results: ReelResponseDto[] = [];

        for (const id of reelIds) {
            const cached = await this.reelsRepository.getMetaFromCache(id);
            if (cached) {
                results.push(metaToResponseDto(cached));
                continue;
            }

            const reel = await this.reelsRepository.findById(id);
            if (reel && reel.status === REEL_STATUS.ACTIVE) {
                await this.reelsRepository.setMetaCache(id, reel);
                results.push(toReelResponseDto(reel));
            }
        }

        return results;
    }

    /**
     * Build a cold start feed for a user with no cached feed.
     * Fetches candidates spanning user's affinity categories plus popular reels
     * from other categories (variety). Filters watched via Bloom filter.
     * Round-robin interleaves across categories.
     */
    async buildPersonalisedFallback(
        userId: string,
        limit: number,
    ): Promise<FeedResponseDto> {
        const candidates =
            await this.reelsRepository.getColdStartCandidates(userId);

        if (candidates.length === 0) {
            const fallback = await this.reelsRepository.findActive(limit);
            if (fallback.length === 0)
                return { data: [], meta: { next_cursor: 0, has_more: false } };

            const fallbackReels = await this.annotateReelsWithInteractions(
                userId,
                fallback,
            );

            return {
                data: fallbackReels,
                meta: { next_cursor: 0, has_more: true },
            };
        }

        // BF filter watched reels (graceful degrade)
        const watchedKey = `${REELS_REDIS_KEYS.WATCHED_PREFIX}:${userId}`;
        const candidateIds = candidates.map((c) => c.reelId);
        let filteredCandidates = candidates;

        try {
            const watchedFlags = await this.redis.bfMExists(
                watchedKey,
                candidateIds,
            );
            const afterFilter = candidates.filter((_, i) => !watchedFlags[i]);
            if (afterFilter.length > 0) {
                filteredCandidates = afterFilter;
            }
        } catch {
            this.logger.warn(
                `BF filter failed for cold start feed, userId=${userId}`,
            );
        }

        // Group by category for round-robin interleaving
        const byCategory = new Map<string, string[]>();
        for (const { reelId, category } of filteredCandidates) {
            const bucket = byCategory.get(category) ?? [];
            bucket.push(reelId);
            byCategory.set(category, bucket);
        }

        // Shuffle within each category
        for (const [category, bucket] of byCategory) {
            for (let i = bucket.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [bucket[i], bucket[j]] = [bucket[j], bucket[i]];
            }
            byCategory.set(category, bucket);
        }

        // Round-robin across categories
        const selected: string[] = [];
        const categoryQueues = Array.from(byCategory.values());

        // Fisher-Yates shuffle on category queue order
        for (let i = categoryQueues.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [categoryQueues[i], categoryQueues[j]] = [
                categoryQueues[j],
                categoryQueues[i],
            ];
        }

        const pointers = new Array(categoryQueues.length).fill(0);

        while (selected.length < limit) {
            let addedThisRound = 0;

            for (
                let i = 0;
                i < categoryQueues.length && selected.length < limit;
                i++
            ) {
                const ptr = pointers[i];
                if (ptr < categoryQueues[i].length) {
                    selected.push(categoryQueues[i][ptr]);
                    pointers[i]++;
                    addedThisRound++;
                }
            }

            if (addedThisRound === 0) break;
        }

        if (selected.length === 0) {
            return { data: [], meta: { next_cursor: 0, has_more: false } };
        }

        const reels = await this.resolveReelMetas(selected);
        const selectedReels = await this.annotateReelsWithInteractions(
            userId,
            reels,
        );

        return {
            data: selectedReels,
            meta: {
                next_cursor: 0,
                has_more: true,
            },
        };
    }

    /**
     * Annotate reels with per-user is_liked / is_saved flags.
     * Used by feed, search, and management sub-services.
     */
    async annotateReelsWithInteractions(
        userId: string,
        reels: ReelResponseDto[] | Reel[],
    ): Promise<FeedItemDto[]> {
        const reelIds = reels.map((r) => r.id);
        const [likedIds, savedIds] = await Promise.all([
            this.reelsRepository.bulkIsLiked(userId, reelIds),
            this.reelsRepository.bulkIsSaved(userId, reelIds),
        ]);
        const likedSet = new Set(likedIds);
        const savedSet = new Set(savedIds);

        return reels.map((r) => ({
            ...r,
            is_liked: likedSet.has(r.id),
            is_saved: savedSet.has(r.id),
        }));
    }
}
