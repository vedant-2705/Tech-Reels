/**
 * @module modules/feed/services/candidate-generator.service
 * @description
 * Generates a deduplicated pool of candidate reel IDs for feed building.
 * Runs four sources in parallel and merges results into a single capped set.
 *
 * Sources:
 *   A - Affinity tags:        SUNION of Redis tag sets for user's top N tags
 *   B - Trending:             Top reels from trending:reels sorted set
 *   C - Recently watched:     SUNION of tag sets for last 5 watched reels
 *   D - Difficulty matched:   Popular reels matching user's experience level
 *
 * Each source degrades gracefully - a Redis miss, empty result, or error
 * in one source does not block the others.
 */

import { Injectable, Logger } from "@nestjs/common";

import { FeedRepository } from "../feed.repository";
import {
    AFFINITY_TAG_LIMIT,
    FEED_DIVERSITY_EXCLUDE_TOP_N,
    FEED_DIVERSITY_FLOOR,
    FEED_TARGET_SIZE,
    TRENDING_CANDIDATE_LIMIT,
} from "../feed.constants";

/** Maximum total candidate IDs before deduplication cap. */
const CANDIDATE_CAP = 200;

/** Number of recently watched reels to use for Source C. */
const RECENTLY_WATCHED_LIMIT = 5;

/** Number of difficulty-matched popular reels for Source D. */
const DIFFICULTY_POPULAR_LIMIT = 30;

/**
 * Produces a merged, deduplicated, capped pool of candidate reel IDs.
 */
@Injectable()
export class CandidateGeneratorService {
    private readonly logger = new Logger(CandidateGeneratorService.name);

    /**
     * @param feedRepository Feed data-access layer for DB and Redis reads.
     */
    constructor(private readonly feedRepository: FeedRepository) {}

    /**
     * Generate up to CANDIDATE_CAP candidate reel IDs for a user.
     * All four sources run in parallel via Promise.all.
     * Results are merged, deduplicated, and capped at CANDIDATE_CAP.
     *
     * Also enforces diversity floor: ensures at least FEED_DIVERSITY_FLOOR
     * fraction of candidates come from outside the user's top
     * FEED_DIVERSITY_EXCLUDE_TOP_N affinity tags.
     *
     * @param userId User UUID.
     * @returns Array of up to CANDIDATE_CAP distinct reel ID strings.
     */
    async generate(userId: string): Promise<string[]> {
        const [sourceA, sourceB, sourceC, sourceD] = await Promise.all([
            this.sourceA(userId),
            this.sourceB(),
            this.sourceC(userId),
            this.sourceD(userId),
        ]);

        this.logger.debug(
            `Candidate sources for userId=${userId}: A=${sourceA.affinityIds.length} B=${sourceB.length} C=${sourceC.length} D=${sourceD.length}`,
        );

        // Merge all sources - deduplicate via Set
        const allIds = new Set<string>([
            ...sourceA.affinityIds,
            ...sourceB,
            ...sourceC,
            ...sourceD,
        ]);

        // Enforce diversity floor before capping
        const diversified = this.enforceDiversityFloor(
            Array.from(allIds),
            sourceA.topTagIds,
            [...sourceB, ...sourceC, ...sourceD],
        );

        const capped = diversified.slice(0, CANDIDATE_CAP);

        this.logger.debug(
            `Total candidates after merge+diversity+cap for userId=${userId}: ${capped.length}`,
        );

        return capped;
    }

    /**
     * Source A - Affinity tags.
     * Fetches the user's top AFFINITY_TAG_LIMIT tags by score, then performs
     * a Redis SUNION across their tag sets. Returns both the candidate IDs
     * and the top FEED_DIVERSITY_EXCLUDE_TOP_N tag IDs for diversity enforcement.
     *
     * @param userId User UUID.
     * @returns Object with affinityIds and topTagIds arrays.
     */
    private async sourceA(
        userId: string,
    ): Promise<{ affinityIds: string[]; topTagIds: string[] }> {
        try {
            const affinityTags = await this.feedRepository.getUserAffinityTags(
                userId,
                AFFINITY_TAG_LIMIT,
            );

            if (affinityTags.length === 0) {
                return { affinityIds: [], topTagIds: [] };
            }

            const tagIds = affinityTags.map((t) => t.tagId);
            const topTagIds = tagIds.slice(0, FEED_DIVERSITY_EXCLUDE_TOP_N);

            const affinityIds =
                await this.feedRepository.getReelIdsByTagUnion(tagIds);

            return { affinityIds, topTagIds };
        } catch (err) {
            this.logger.warn(
                `Source A failed for userId=${userId}: ${(err as Error).message}`,
            );
            return { affinityIds: [], topTagIds: [] };
        }
    }

    /**
     * Source B - Trending reels.
     * Reads top TRENDING_CANDIDATE_LIMIT reel IDs from the trending:reels
     * sorted set. Returns empty array if the set is absent (cron not yet run).
     *
     * @returns Array of trending reel ID strings.
     */
    private async sourceB(): Promise<string[]> {
        try {
            return await this.feedRepository.getTrendingReelIds(
                TRENDING_CANDIDATE_LIMIT,
            );
        } catch (err) {
            this.logger.warn(
                `Source B (trending) failed: ${(err as Error).message}`,
            );
            return [];
        }
    }

    /**
     * Source C - Similar to recently watched.
     * Fetches the last RECENTLY_WATCHED_LIMIT watched reel IDs for the user,
     * resolves their tag IDs, then SUNIONs those tag sets in Redis.
     * Returns empty array for new users with no watch history.
     *
     * @param userId User UUID.
     * @returns Array of candidate reel ID strings.
     */
    private async sourceC(userId: string): Promise<string[]> {
        try {
            const recentReelIds =
                await this.feedRepository.getRecentlyWatchedReelIds(
                    userId,
                    RECENTLY_WATCHED_LIMIT,
                );

            if (recentReelIds.length === 0) return [];

            const tagIds =
                await this.feedRepository.getTagIdsForReels(recentReelIds);

            if (tagIds.length === 0) return [];

            return await this.feedRepository.getReelIdsByTagUnion(tagIds);
        } catch (err) {
            this.logger.warn(
                `Source C failed for userId=${userId}: ${(err as Error).message}`,
            );
            return [];
        }
    }

    /**
     * Source D - Difficulty matched popular reels.
     * Looks up the user's experience level and fetches the top
     * DIFFICULTY_POPULAR_LIMIT active reels at the matching difficulty,
     * ordered by view_count DESC.
     * Defaults to 'beginner' if experience level cannot be determined.
     *
     * @param userId User UUID.
     * @returns Array of reel ID strings.
     */
    private async sourceD(userId: string): Promise<string[]> {
        try {
            const level =
                await this.feedRepository.getUserExperienceLevel(userId);

            // Map experience level to primary difficulty
            const difficultyMap: Record<string, string> = {
                novice: "beginner",
                intermediate: "intermediate",
                advanced: "advanced",
            };

            const difficulty = difficultyMap[level ?? "novice"] ?? "beginner";

            return await this.feedRepository.getPopularByDifficulty(
                difficulty,
                DIFFICULTY_POPULAR_LIMIT,
            );
        } catch (err) {
            this.logger.warn(
                `Source D failed for userId=${userId}: ${(err as Error).message}`,
            );
            return [];
        }
    }

    /**
     * Enforce the diversity floor on the merged candidate pool.
     * Ensures at least FEED_DIVERSITY_FLOOR * FEED_TARGET_SIZE candidates
     * come from outside the top affinity tag IDs (i.e. from Source B, C, D).
     *
     * Strategy:
     *   1. Partition candidates into affinity-sourced and diverse-sourced sets.
     *   2. If diverse count already meets the floor, return as-is.
     *   3. Otherwise prepend diverse candidates to the front so they survive
     *      the CANDIDATE_CAP slice in the caller.
     *
     * @param candidates Merged deduplicated candidate IDs.
     * @param topTagIds Top affinity tag IDs used to classify affinity candidates.
     * @param diverseSourceIds Reel IDs from Sources B, C, D (known diverse).
     * @returns Reordered candidate array with diversity floor enforced.
     */
    private enforceDiversityFloor(
        candidates: string[],
        topTagIds: string[],
        diverseSourceIds: string[],
    ): string[] {
        const minDiverse = Math.ceil(FEED_TARGET_SIZE * FEED_DIVERSITY_FLOOR);
        const diverseSet = new Set(diverseSourceIds);

        const diverse: string[] = [];
        const affinity: string[] = [];

        for (const id of candidates) {
            if (diverseSet.has(id)) {
                diverse.push(id);
            } else {
                affinity.push(id);
            }
        }

        if (diverse.length >= minDiverse) {
            // Already meets floor - return original order (affinity-first)
            return candidates;
        }

        // Prepend diverse candidates so they survive the CANDIDATE_CAP slice
        // Affinity candidates fill the rest
        return [...diverse, ...affinity];
    }
}
