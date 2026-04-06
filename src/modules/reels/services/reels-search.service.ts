/**
 * @module modules/reels/services/reels-search.service
 * @description
 * Handles reel search and share functionality:
 *   searchReels - tag matching -> SUNION -> BF filter -> DB sort -> paginate
 *   shareReel   - increment share count, publish event, return shareable URL
 */

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { ReelsRepository } from "../reels.repository";
import { RedisService } from "@redis/redis.service";
import { ReelsFeedService } from "./reels-feed.service";

import { SearchReelsQueryDto } from "../dto/search-reels-query.dto";
import { SearchReelsResponseDto } from "../dto/search-reels-response.dto";
import { ShareReelResponseDto } from "../dto/share-reel-response.dto";

import { ReelNotFoundException } from "../exceptions/reel-not-found.exception";
import { buildReelShareUrl } from "../utils/build-reel-share-url.util";

import {
    REEL_META_FIELD,
    REEL_STATUS,
    REELS_APP_ENV,
    REELS_REDIS_KEYS,
} from "../reels.constants";
import { MessagingService, REELS } from "@modules/messaging";

@Injectable()
export class ReelsSearchService {
    private readonly logger = new Logger(ReelsSearchService.name);

    constructor(
        private readonly reelsRepository: ReelsRepository,
        private readonly redis: RedisService,
        private readonly config: ConfigService,
        private readonly reelsFeedService: ReelsFeedService,
        private readonly messagingService: MessagingService,
    ) {}

    /**
     * Full-text / tag search across active reels.
     * Flow: match tags -> SUNION Redis Sets -> BF filter watched -> DB sort by view_count.
     * Falls back to popular active reels when no tags match the query.
     */
    async searchReels(
        userId: string,
        dto: SearchReelsQueryDto,
    ): Promise<SearchReelsResponseDto> {
        const offset = dto.cursor ?? 0;
        const limit = dto.limit ?? 10;

        const matchedTags = await this.reelsRepository.findTagsByQuery(dto.q);

        if (matchedTags.length === 0) {
            const fallback = await this.reelsRepository.findActive(limit);
            const fallbackReelsMapped =
                await this.reelsFeedService.annotateReelsWithInteractions(
                    userId,
                    fallback,
                );

            return {
                data: fallbackReelsMapped,
                meta: { next_cursor: null, has_more: false },
                matched_tags: [],
            };
        }

        // SUNION across all matched tag Redis Sets
        const tagSetKeys = matchedTags.map(
            (t) => `${REELS_REDIS_KEYS.TAG_SET_PREFIX}:${t.id}`,
        );
        const candidateIds = await this.redis.sunion(tagSetKeys);

        let resolvedCandidateIds = candidateIds;

        if (candidateIds.length === 0) {
            this.logger.warn(
                `SUNION returned empty for query "${dto.q}" - Redis tag sets missing, falling back to DB`,
            );
            const dbCandidateIds =
                await this.reelsRepository.findActiveReelIdsByTagIds(
                    matchedTags.map((t) => t.id),
                );

            if (dbCandidateIds.length === 0) {
                const fallback = await this.reelsRepository.findActive(limit);
                const fallbackReelsMapped =
                    await this.reelsFeedService.annotateReelsWithInteractions(
                        userId,
                        fallback,
                    );

                return {
                    data: fallbackReelsMapped,
                    meta: { next_cursor: null, has_more: false },
                    matched_tags: matchedTags,
                };
            }

            resolvedCandidateIds = dbCandidateIds;
        }

        // BF filter watched reels (graceful degrade)
        const watchedKey = `${REELS_REDIS_KEYS.WATCHED_PREFIX}:${userId}`;
        const cappedCandidates = resolvedCandidateIds.slice(0, 200);
        let filteredIds = cappedCandidates;

        try {
            const watchedFlags = await this.redis.bfMExists(
                watchedKey,
                cappedCandidates,
            );
            filteredIds = cappedCandidates.filter((_, i) => !watchedFlags[i]);
        } catch {
            filteredIds = cappedCandidates;
        }

        if (filteredIds.length === 0) {
            filteredIds = cappedCandidates;
        }

        // DB fetch sorted by view_count DESC with pagination
        const { reels, total } = await this.reelsRepository.searchCandidates(
            filteredIds,
            offset,
            limit + 1,
        );

        const hasMore = reels.length > limit;
        const page = reels.slice(0, limit);

        const pageReelsMapped =
            await this.reelsFeedService.annotateReelsWithInteractions(
                userId,
                page,
            );

        void this.messagingService.dispatchJob(REELS.QUEUE_JOBS.FEED_SEARCH, {
            userId,
            reason: REELS.QUEUE_JOBS.FEED_SEARCH,
            tagIds: matchedTags.map((t) => t.id),
        });

        return {
            data: pageReelsMapped,
            meta: {
                next_cursor: hasMore ? offset + limit : null,
                has_more: hasMore,
            },
            matched_tags: matchedTags,
        };
    }

    /**
     * Share a reel - increment share_count, publish event, return URL.
     * NOT idempotent - each call increments share_count.
     */
    async shareReel(
        userId: string,
        reelId: string,
    ): Promise<ShareReelResponseDto> {
        const reel = await this.reelsRepository.findById(reelId);
        if (!reel || reel.status !== REEL_STATUS.ACTIVE) {
            throw new ReelNotFoundException();
        }

        await this.reelsRepository.incrementShareCount(reelId);
        await this.reelsRepository.incrMetaCount(
            reelId,
            REEL_META_FIELD.SHARE_COUNT,
            1,
        );

        void this.messagingService.dispatchEvent(
            REELS.EVENTS.USER_INTERACTION.SHARED,
            {
                userId,
                reelId,
                tags: reel.tags.map((t) => t.id),
            },
        );

        void this.messagingService.dispatchJob(
            REELS.EVENTS.USER_INTERACTION.SHARED,
            {
                userId,
                reason: REELS.EVENTS.USER_INTERACTION.SHARED,
                tagIds: reel.tags.map((t) => t.id),
            },
        );

        const appBaseUrl =
            this.config.get<string>(REELS_APP_ENV.APP_BASE_URL) ?? "";
        const share_url = buildReelShareUrl(appBaseUrl, reelId);

        return { shared: true, share_url };
    }
}
