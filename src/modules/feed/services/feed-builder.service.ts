/**
 * @module modules/feed/services/feed-builder.service
 * @description
 * Orchestrates the full feed recommendation pipeline for a single user.
 * Called exclusively by FeedBuildWorker - never called directly from
 * controllers or other services.
 *
 * Pipeline:
 *   1. Generate candidates          (CandidateGeneratorService)
 *   2. Filter watched               (BF.MEXISTS on watched:{userId})
 *   3. Filter already in feed list  (LRANGE feed:{userId} 0 -1)
 *   4. Score remaining candidates   (ReelScorerService)
 *   5. Round-robin category interleave
 *   6. RPUSH to feed:{userId} + LTRIM to FEED_MAX_LIST_SIZE + EXPIRE
 */

import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";

import { RedisService } from "@redis/redis.service";
import { FeedRepository } from "../feed.repository";
import { CandidateGeneratorService } from "./candidate-generator.service";
import { ReelScorerService, ScoredReel } from "./reel-scorer.service";
import {
    FEED_MAX_LIST_SIZE,
    FEED_REDIS_KEYS,
    FEED_TARGET_SIZE,
    FEED_TTL,
} from "../feed.constants";

/**
 * Builds and writes a personalised feed list for a user.
 */
@Injectable()
export class FeedBuilderService {
    private readonly logger = new Logger(FeedBuilderService.name);

    /**
     * @param candidateGenerator Generates the raw candidate pool.
     * @param scorer Scores and categorises candidates.
     * @param feedRepository Feed data-access for Redis list writes and reads.
     * @param redis Redis service for Bloom filter operations.
     * @param reelsProcessingService For pre-populating reel:meta cache after feed build.
     */
    constructor(
        private readonly candidateGenerator: CandidateGeneratorService,
        private readonly scorer: ReelScorerService,
        private readonly feedRepository: FeedRepository,
        private readonly redis: RedisService,
    ) {}

    /**
     * Execute the full feed building pipeline for a user.
     * Writes the resulting reel IDs to feed:{userId} Redis List.
     * Returns early (no write) if the pipeline produces zero candidates
     * after all filtering steps.
     *
     * @param userId User UUID to build the feed for.
     * @returns void
     */
    async build(userId: string): Promise<void> {
        // Step 1 - Generate candidates
        const candidates = await this.candidateGenerator.generate(userId);

        if (candidates.length === 0) {
            this.logger.warn(
                `No candidates generated for userId=${userId} - feed not updated`,
            );
            return;
        }

        // Step 2 - Filter watched via Bloom filter (graceful degrade)
        const afterWatchFilter = await this.filterWatched(userId, candidates);

        // Step 3 - Filter IDs already present in the feed list
        const existingFeedIds =
            await this.feedRepository.getExistingFeedIds(userId);
        const existingSet = new Set(existingFeedIds);
        const afterFeedFilter = afterWatchFilter.filter(
            (id) => !existingSet.has(id),
        );

        if (afterFeedFilter.length === 0) {
            this.logger.debug(
                `All candidates already watched or in feed for userId=${userId} - skipping write`,
            );
            return;
        }

        // Step 4 - Score remaining candidates
        const scored = await this.scorer.score(userId, afterFeedFilter);

        if (scored.length === 0) {
            this.logger.warn(
                `Scorer returned 0 results for userId=${userId} - feed not updated`,
            );
            return;
        }

        // Step 5 - Round-robin category interleaving
        const selected = this.roundRobinSelect(scored, FEED_TARGET_SIZE);

        if (selected.length === 0) {
            this.logger.warn(
                `Round-robin produced 0 results for userId=${userId}`,
            );
            return;
        }

        // Step 6 - Write to Redis feed list
        await this.feedRepository.appendToFeedList(
            userId,
            selected,
            FEED_MAX_LIST_SIZE,
            FEED_TTL,
        );

        this.logger.log(
            `Feed built for userId=${userId}: pushed=${selected.length} total_after_trim≤${FEED_MAX_LIST_SIZE}`,
        );
    }

    /**
     * Run the full feed pipeline for a user and return the selected reel IDs
     * in addition to writing them to Redis.
     * Used by ReelsService as a personalised fallback when the feed list is
     * empty and the worker hasn't finished yet.
     * Returns empty array if the pipeline produces no candidates.
     *
     * @param userId User UUID.
     * @param limit Maximum number of reel IDs to return.
     * @returns Ordered array of selected reel ID strings.
     */
    async buildAndReturn(userId: string, limit: number): Promise<string[]> {
        const candidates = await this.candidateGenerator.generate(userId);
        if (candidates.length === 0) return [];

        const afterWatchFilter = await this.filterWatched(userId, candidates);

        const existingFeedIds =
            await this.feedRepository.getExistingFeedIds(userId);
        const existingSet = new Set(existingFeedIds);
        const afterFeedFilter = afterWatchFilter.filter(
            (id) => !existingSet.has(id),
        );

        if (afterFeedFilter.length === 0) return [];

        const scored = await this.scorer.score(userId, afterFeedFilter);
        if (scored.length === 0) return [];

        const selected = this.roundRobinSelect(scored, FEED_TARGET_SIZE);
        if (selected.length === 0) return [];

        // Write to Redis for subsequent requests
        await this.feedRepository.appendToFeedList(
            userId,
            selected,
            FEED_MAX_LIST_SIZE,
            FEED_TTL,
        );

        // Return only the requested limit for immediate response
        return selected.slice(0, limit);
    }

    /**
     * Filter candidate reel IDs through the user's Bloom filter.
     * IDs flagged as watched are excluded. If BF.MEXISTS fails, all
     * candidates pass through (graceful degrade - never block the pipeline).
     *
     * @param userId User UUID.
     * @param candidateIds Array of candidate reel ID strings.
     * @returns Filtered array with watched IDs removed.
     */
    private async filterWatched(
        userId: string,
        candidateIds: string[],
    ): Promise<string[]> {
        const watchedKey = `${FEED_REDIS_KEYS.WATCHED_PREFIX}:${userId}`;

        try {
            const watchedFlags = await this.redis.bfMExists(
                watchedKey,
                candidateIds,
            );
            const filtered = candidateIds.filter((_, i) => !watchedFlags[i]);

            // If BF filtered everything (power user who has watched everything),
            // fall back to unfiltered candidates so the feed is never empty.
            return filtered.length > 0 ? filtered : candidateIds;
        } catch (err) {
            this.logger.warn(
                `BF.MEXISTS failed for userId=${userId}: ${(err as Error).message} - skipping watch filter`,
            );
            return candidateIds;
        }
    }

    /**
     * Select up to `target` reels using round-robin category interleaving.
     * Ensures no two consecutive reels share the same category where possible.
     *
     * Algorithm:
     *   1. Group scored reels by primaryCategory (already sorted DESC within scorer).
     *   2. Fisher-Yates shuffle the order of category queues (not items within).
     *   3. Round-robin across queues, picking one item per queue per round.
     *   4. Stop when target count is reached or all queues are exhausted.
     *
     * @param scored Array of ScoredReel objects sorted by score DESC.
     * @param target Maximum number of reels to select.
     * @returns Ordered array of selected reel ID strings.
     */
    private roundRobinSelect(scored: ScoredReel[], target: number): string[] {
        // Group by primary category - items within each bucket are already
        // sorted by score DESC (preserved from scorer output order)
        const buckets = new Map<string, string[]>();

        for (const { reelId, primaryCategory } of scored) {
            const bucket = buckets.get(primaryCategory) ?? [];
            bucket.push(reelId);
            buckets.set(primaryCategory, bucket);
        }

        // Convert to array of queues for round-robin iteration
        const queues = Array.from(buckets.values());

        // Fisher-Yates shuffle on queue order - randomises which category
        // leads each round without disturbing score order within buckets
        for (let i = queues.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [queues[i], queues[j]] = [queues[j], queues[i]];
        }

        const pointers = new Array<number>(queues.length).fill(0);
        const selected: string[] = [];

        // Round-robin until target reached or all queues exhausted
        while (selected.length < target) {
            let addedThisRound = 0;

            for (
                let i = 0;
                i < queues.length && selected.length < target;
                i++
            ) {
                const ptr = pointers[i];
                if (ptr < queues[i].length) {
                    selected.push(queues[i][ptr]);
                    pointers[i]++;
                    addedThisRound++;
                }
            }

            // All queues exhausted - break to avoid infinite loop
            if (addedThisRound === 0) break;
        }

        return selected;
    }
}
