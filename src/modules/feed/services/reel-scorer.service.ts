/**
 * @module modules/feed/services/reel-scorer.service
 * @description
 * Scores a pool of candidate reel IDs for a specific user and returns
 * them sorted by score descending, each annotated with a primary category
 * for round-robin interleaving in FeedBuilderService.
 *
 * Scoring formula per reel:
 *   score =
 *     (affinity_score_sum  * AFFINITY weight)
 *   + (avg_completion/100  * COMPLETION_RATE weight)
 *   + (save_rate           * SAVE_RATE weight)
 *   + (like_rate           * LIKE_RATE weight)
 *   + (recency_decay       * RECENCY weight)
 *   * difficulty_multiplier
 *
 * Where:
 *   affinity_score_sum    = sum of user's affinity scores for the reel's tags
 *   save_rate             = save_count / max(view_count, 1)
 *   like_rate             = like_count / max(view_count, 1)
 *   recency_decay         = 1 / (1 + hours_since_posted / 48)
 *   difficulty_multiplier = DIFFICULTY_PREFERENCE[userLevel][reelDifficulty]
 *
 * Primary category:
 *   Tag with the highest user affinity score among the reel's tags.
 *   Falls back to alphabetically first category for new users (no affinity).
 */

import { Injectable, Logger } from "@nestjs/common";

import { FeedRepository } from "../feed.repository";
import {
    DIFFICULTY_PREFERENCE,
    FEED_SCORING_WEIGHTS,
    UserExperienceLevel,
} from "../feed.constants";

/** A scored and categorised candidate reel ready for round-robin selection. */
export interface ScoredReel {
    reelId: string;
    score: number;
    /** Primary category used for round-robin bucket assignment. */
    primaryCategory: string;
}

/** Fallback primary category when a reel has no tag data. */
const FALLBACK_CATEGORY = "uncategorised";

/** Upper bound on affinity tag fetch for scorer's user affinity map. */
const AFFINITY_MAP_LIMIT = 999;

/**
 * Scores candidate reels for a user using a weighted multi-signal formula.
 */
@Injectable()
export class ReelScorerService {
    private readonly logger = new Logger(ReelScorerService.name);

    /**
     * @param feedRepository Feed data-access layer for scoring data queries.
     */
    constructor(private readonly feedRepository: FeedRepository) {}

    /**
     * Score a pool of candidate reel IDs for a user.
     * Fetches all required data in three parallel queries, then scores
     * each candidate and returns results sorted by score descending.
     * Candidates absent from DB (non-active or deleted) are silently excluded.
     *
     * @param userId User UUID.
     * @param candidateIds Array of candidate reel IDs to score.
     * @returns Array of ScoredReel objects sorted by score DESC.
     */
    async score(userId: string, candidateIds: string[]): Promise<ScoredReel[]> {
        if (candidateIds.length === 0) return [];

        // Fetch all scoring inputs in parallel - three independent queries
        const [scoringDataRows, completionRates, affinityTags, userLevel] =
            await Promise.all([
                this.feedRepository.getReelScoringData(candidateIds),
                this.feedRepository.getAvgCompletionRates(candidateIds),
                this.feedRepository.getUserAffinityTags(
                    userId,
                    AFFINITY_MAP_LIMIT,
                ),
                this.feedRepository.getUserExperienceLevel(userId),
            ]);

        // Build lookup maps for O(1) access during scoring loop
        const completionMap = new Map(
            completionRates.map((r) => [r.reelId, r.avg_completion]),
        );

        // tagId -> affinity score map for this user
        const affinityMap = new Map(
            affinityTags.map((t) => [t.tagId, t.score]),
        );

        // tagId -> category map derived from affinity tags
        // (covers tags the user has affinity for - sufficient for primary category)
        const tagCategoryMap = new Map(
            affinityTags.map((t) => [t.tagId, t.category]),
        );

        const effectiveLevel: UserExperienceLevel = userLevel ?? "novice";
        const now = Date.now();

        const scored: ScoredReel[] = [];

        for (const row of scoringDataRows) {
            try {
                const avgCompletion = completionMap.get(row.id) ?? 0;
                const viewCount = Math.max(row.view_count, 1);
                const saveRate = row.save_count / viewCount;
                const likeRate = row.like_count / viewCount;

                // Recency decay: 1 / (1 + hours_since_posted / 48)
                // Newer reels approach 1.0; reels posted 48h ago score ~0.5
                const hoursAgo =
                    (now - new Date(row.created_at).getTime()) / 3_600_000;
                const recencyDecay = 1 / (1 + hoursAgo / 48);

                // Difficulty multiplier from DIFFICULTY_PREFERENCE table
                const difficultyMultiplier =
                    DIFFICULTY_PREFERENCE[effectiveLevel]?.[
                        row.difficulty as keyof (typeof DIFFICULTY_PREFERENCE)[UserExperienceLevel]
                    ] ?? 1.0;

                // Affinity score sum: sum of user's affinity scores for this reel's tags
                let affinityScoreSum = 0;
                for (const tagId of row.tag_ids) {
                    affinityScoreSum += affinityMap.get(tagId) ?? 0;
                }

                // Weighted score formula
                const rawScore =
                    affinityScoreSum * FEED_SCORING_WEIGHTS.AFFINITY +
                    (avgCompletion / 100) * FEED_SCORING_WEIGHTS.COMPLETION_RATE +
                    saveRate * FEED_SCORING_WEIGHTS.SAVE_RATE +
                    likeRate * FEED_SCORING_WEIGHTS.LIKE_RATE +
                    recencyDecay * FEED_SCORING_WEIGHTS.RECENCY;

                const finalScore = rawScore * difficultyMultiplier;

                // Primary category: tag with highest affinity score for this reel
                const primaryCategory = this.resolvePrimaryCategory(
                    row.tag_ids,
                    row.categories,
                    affinityMap,
                    tagCategoryMap,
                );

                scored.push({
                    reelId: row.id,
                    score: finalScore,
                    primaryCategory,
                });
            } catch (err) {
                this.logger.warn(
                    `Scoring failed for reelId=${row.id}: ${(err as Error).message} - skipping`,
                );
            }
        }

        // Sort by score descending
        scored.sort((a, b) => b.score - a.score);

        return scored;
    }

    /**
     * Determine the primary category for a reel for round-robin bucketing.
     *
     * Priority:
     *   1. Category of the tag with the highest user affinity score.
     *   2. Alphabetically first category from the reel's categories array
     *      (fallback for new users with no affinity data).
     *   3. FALLBACK_CATEGORY if the reel has no tags at all.
     *
     * @param tagIds Tag UUIDs associated with the reel.
     * @param categories Distinct category strings for the reel's tags.
     * @param affinityMap Map of tagId to user affinity score.
     * @param tagCategoryMap Map of tagId to category string.
     * @returns Primary category string.
     */
    private resolvePrimaryCategory(
        tagIds: string[],
        categories: string[],
        affinityMap: Map<string, number>,
        tagCategoryMap: Map<string, string>,
    ): string {
        if (tagIds.length === 0) return FALLBACK_CATEGORY;

        // Find the tag with the highest affinity score for this user
        let bestTagId: string | null = null;
        let bestScore = -1;

        for (const tagId of tagIds) {
            const score = affinityMap.get(tagId) ?? -1;
            if (score > bestScore) {
                bestScore = score;
                bestTagId = tagId;
            }
        }

        // If we found a tag with affinity data, use its category
        if (bestTagId !== null && bestScore >= 0) {
            const category = tagCategoryMap.get(bestTagId);
            if (category) return category;
        }

        // Fallback: alphabetically first category (deterministic for new users)
        if (categories.length > 0) {
            return [...categories].sort()[0];
        }

        return FALLBACK_CATEGORY;
    }
}
