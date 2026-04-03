/**
 * @module modules/gamification/gamification.service
 * @description
 * Application service for the Gamification module.
 * Owns all business logic and coordinates repository operations.
 * Called exclusively by workers - this module has no HTTP controller.
 *
 * Responsibilities:
 *   awardXp        - deduplicate, insert ledger, update user totals,
 *                    update affinity, update leaderboard
 *   evaluateBadges - fetch eligible badges, run criteria, award if met,
 *                    publish SSE notification
 *   updateStreak   - increment or freeze streak on watch event
 *
 * Never calls DatabaseService directly.
 * Never throws HTTP exceptions - logs errors and re-throws for BullMQ retry.
 */

import { Injectable, Logger } from "@nestjs/common";
import { GamificationService } from "./gamification.service.abstract";
import { GamificationRepository } from "./gamification.repository";
import { RedisService } from "@redis/redis.service";
import { BadgeCriteriaRegistry } from "./criteria/criteria.registry";
import { uuidv7 } from "@common/utils/uuidv7.util";
import {
    XpAwardJobPayload,
    BadgeEvaluationJobPayload,
    AwardedBadgePayload,
    CriteriaEvaluationContext,
} from "./entities/gamification.entity";
import {
    XP_SOURCE,
    REEL_WATCH_TOKEN_REWARD,
    STREAK_BONUS_TOKEN_REWARD,
    STREAK_GRACE_DAYS,
    LEADERBOARD_TOP_TAGS_COUNT,
    GAMIFICATION_EVENTS,
    SSE_EVENTS_CHANNEL,
    GAMIFICATION_PUBSUB_CHANNEL,
} from "./gamification.constants";

/**
 * Core gamification logic. All methods are called by BullMQ workers.
 */
@Injectable()
export class GamificationServiceImpl extends GamificationService {
    private readonly logger = new Logger(GamificationService.name);

    /**
     * @param gamificationRepository Data-access layer for gamification.
     * @param redis                  RedisService for pub/sub publishing.
     */
    constructor(
        private readonly gamificationRepository: GamificationRepository,
        private readonly redis: RedisService,
    ) {
        super();
    }

    // -------------------------------------------------------------------------
    // awardXp
    // -------------------------------------------------------------------------

    /**
     *
     * Flow:
     *   1. Deduplication check (Redis sentinel, then DB fallback)
     *   2. Resolve token delta based on source
     *   3. Insert xp_ledger row
     *   4. Set Redis dedup sentinel
     *   5. Update users.total_xp and users.token_balance atomically
     *   6. Update topic affinity for relevant tags
     *   7. Increment leaderboard sorted sets for top tags
     *   8. Refresh top_tags cache
     *   9. Publish XP_AWARDED to gamification_events channel
     *
     * Idempotent: if XP for this reference has already been awarded,
     * logs and returns without side effects. Safe on BullMQ retry.
     *
     * @inheritdoc
     */
    async awardXp(payload: XpAwardJobPayload): Promise<void> {
        const { userId, source, xp_amount, reference_id, note } = payload;

        // Deduplication (only when reference_id is present)
        if (reference_id) {
            const dedupHit =
                await this.gamificationRepository.hasXpDedupSentinel(
                    userId,
                    source,
                    reference_id,
                );

            if (dedupHit) {
                this.logger.warn(
                    `[awardXp] Dedup hit (Redis): userId=${userId} source=${source} ref=${reference_id}. Skipping.`,
                );
                return;
            }

            // DB fallback dedup - handles case where sentinel expired but ledger row exists
            const dbDedupHit =
                await this.gamificationRepository.hasXpEntryForReference(
                    userId,
                    source,
                    reference_id,
                );

            if (dbDedupHit) {
                this.logger.warn(
                    `[awardXp] Dedup hit (DB): userId=${userId} source=${source} ref=${reference_id}. Skipping.`,
                );
                // Restore sentinel so future retries hit Redis instead of DB
                await this.gamificationRepository.setXpDedupSentinel(
                    userId,
                    source,
                    reference_id,
                );
                return;
            }
        }

        // Resolve token delta and reel/tag context based on source
        let tokenDelta = 0;
        let reelId: string | null = null;

        if (source === XP_SOURCE.CHALLENGE_CORRECT && reference_id) {
            // reference_id = challengeId for challenge_correct source
            const challengeRow =
                await this.gamificationRepository.getChallengeTokenReward(
                    reference_id,
                );
            if (challengeRow) {
                tokenDelta = challengeRow.token_reward;
                reelId = challengeRow.reel_id;
            }
        } else if (source === XP_SOURCE.REEL_WATCH) {
            tokenDelta = REEL_WATCH_TOKEN_REWARD;
            reelId = reference_id ?? null;
        } else if (source === XP_SOURCE.STREAK_BONUS) {
            tokenDelta = STREAK_BONUS_TOKEN_REWARD;
        }

        // Insert xp_ledger row
        await this.gamificationRepository.insertXpLedgerEntry({
            id: uuidv7(),
            user_id: userId,
            delta: xp_amount,
            source,
            reference_id: reference_id ?? null,
            note: note ?? null,
        });

        // Set Redis dedup sentinel (after successful DB insert)
        if (reference_id) {
            await this.gamificationRepository.setXpDedupSentinel(
                userId,
                source,
                reference_id,
            );
        }

        // Update users.total_xp and users.token_balance atomically
        await this.gamificationRepository.updateUserXpAndTokens(
            userId,
            xp_amount,
            tokenDelta,
        );

        // Update topic affinity for the reel's tags (if applicable)
        if (reelId) {
            await this.updateAffinityForReel(userId, reelId);
        }

        // Increment leaderboard and refresh top tags cache
        if (reelId) {
            await this.updateLeaderboardForUser(userId, xp_amount);
        }

        // Publish XP_AWARDED event
        void this.redis.publish(
            GAMIFICATION_PUBSUB_CHANNEL,
            JSON.stringify({
                event: GAMIFICATION_EVENTS.XP_AWARDED,
                userId,
                xp_amount,
                source,
                timestamp: new Date().toISOString(),
            }),
        );

        this.logger.log(
            `[awardXp] Awarded ${xp_amount} XP + ${tokenDelta} tokens to userId=${userId} source=${source}`,
        );
    }

    // -------------------------------------------------------------------------
    // evaluateBadges
    // -------------------------------------------------------------------------

    /**
     *
     * Flow per badge:
     *   1. Check userHasBadge (skip if already earned)
     *   2. Acquire distributed lock (skip if lock not acquired - concurrent worker)
     *   3. Re-check userHasBadge inside lock (double-check pattern)
     *   4. Run criteria evaluator
     *   5. Award badge if criteria met
     *   6. Publish BADGE_EARNED to sse_events
     *   7. Release lock (finally block)
     *
     * @inheritdoc
     */
    async evaluateBadges(
        payload: BadgeEvaluationJobPayload,
    ): Promise<AwardedBadgePayload[]> {
        const { userId, event, meta } = payload;
        const awarded: AwardedBadgePayload[] = [];

        // Fetch badges eligible for this event
        const badges =
            await this.gamificationRepository.getActiveBadgesForEvent(event);

        if (badges.length === 0) return [];

        // Pre-fetch evaluation context data (one DB round-trip per data type)
        const totalCorrectCount =
            await this.gamificationRepository.getTotalCorrectCount(userId);

        // Fetch enough attempts to evaluate the highest accuracy_streak threshold
        // Highest seeded threshold is 20 - fetch 25 for safety margin
        const recentAttempts =
            await this.gamificationRepository.getRecentAttempts(userId, 25);

        const context: CriteriaEvaluationContext = {
            userId,
            meta,
            totalCorrectCount,
            recentAttempts,
        };

        for (const badge of badges) {
            // Skip criteria types not registered (defensive - unknown future types)
            if (!BadgeCriteriaRegistry.has(badge.criteria.type)) {
                this.logger.warn(
                    `[evaluateBadges] No evaluator for criteria type "${badge.criteria.type}" on badge "${badge.code}". Skipping.`,
                );
                continue;
            }

            // Fast path: user already has this badge
            const alreadyHas = await this.gamificationRepository.userHasBadge(
                userId,
                badge.id,
            );
            if (alreadyHas) continue;

            // Acquire distributed lock to prevent concurrent award
            const lockAcquired =
                await this.gamificationRepository.acquireBadgeAwardLock(
                    userId,
                    badge.code,
                );
            if (!lockAcquired) {
                this.logger.warn(
                    `[evaluateBadges] Lock not acquired for userId=${userId} badge=${badge.code}. Skipping (concurrent worker).`,
                );
                continue;
            }

            try {
                // Double-check inside lock
                const stillMissing =
                    !(await this.gamificationRepository.userHasBadge(
                        userId,
                        badge.id,
                    ));
                if (!stillMissing) continue;

                // Evaluate criteria
                const evaluator = BadgeCriteriaRegistry.get(
                    badge.criteria.type,
                );
                const { met } = evaluator.evaluate(badge.criteria, context);

                if (!met) continue;

                // Award badge
                await this.gamificationRepository.awardBadge(
                    uuidv7(),
                    userId,
                    badge.id,
                );

                const awardedPayload: AwardedBadgePayload = {
                    badgeId: badge.id,
                    badgeCode: badge.code,
                    badgeName: badge.name,
                    iconUrl: badge.icon_url,
                    earnedAt: new Date().toISOString(),
                };

                awarded.push(awardedPayload);

                // Publish BADGE_EARNED to sse_events for real-time frontend toast
                void this.redis.publish(
                    SSE_EVENTS_CHANNEL,
                    JSON.stringify({
                        event: GAMIFICATION_EVENTS.BADGE_EARNED,
                        userId,
                        badgeId: badge.id,
                        badgeCode: badge.code,
                        badgeName: badge.name,
                        iconUrl: badge.icon_url,
                        timestamp: new Date().toISOString(),
                    }),
                );

                this.logger.log(
                    `[evaluateBadges] Badge awarded: userId=${userId} badge=${badge.code}`,
                );
            } finally {
                await this.gamificationRepository.releaseBadgeAwardLock(
                    userId,
                    badge.code,
                );
            }
        }

        return awarded;
    }

    // -------------------------------------------------------------------------
    // updateStreak
    // -------------------------------------------------------------------------

    /**
     *
     * Streak logic (all dates in UTC):
     *   - last_active_date = today          -> already counted, touch only
     *   - last_active_date = yesterday      -> increment streak, clear freeze
     *   - last_active_date = 2 days ago     -> grace period: set freeze to tomorrow
     *   - last_active_date > GRACE_DAYS ago -> streak resets to 0, start fresh
     *   - last_active_date = null           -> first watch, initialise streak to 1
     *
     * If streak_freeze_until >= today: treat as grace - preserve streak,
     * increment normally, clear freeze.
     *
     * @inheritdoc
     */
    async updateStreak(userId: string): Promise<void> {
        const user = await this.gamificationRepository.getUserStreakRow(userId);
        if (!user) {
            this.logger.warn(`[updateStreak] User not found: userId=${userId}`);
            return;
        }

        const todayUtc = this.getTodayUtc();
        const lastActive = user.last_active_date;
        const freezeUntil = user.streak_freeze_until;

        // Already counted today - just ensure last_active_date is set
        if (lastActive === todayUtc) {
            return;
        }

        // User is within an active freeze window - treat as if they returned on time
        if (freezeUntil && freezeUntil >= todayUtc) {
            await this.gamificationRepository.incrementStreak(userId, todayUtc);
            this.logger.log(
                `[updateStreak] Streak resumed from freeze: userId=${userId} streak=${user.current_streak + 1}`,
            );
            return;
        }

        // First watch ever
        if (!lastActive) {
            await this.gamificationRepository.incrementStreak(userId, todayUtc);
            return;
        }

        const daysDiff = this.daysDiffUtc(lastActive, todayUtc);

        if (daysDiff === 1) {
            // Watched yesterday - normal streak increment
            await this.gamificationRepository.incrementStreak(userId, todayUtc);
        } else if (daysDiff <= STREAK_GRACE_DAYS + 1) {
            // Missed exactly one day - activate grace period, increment now
            // (User is watching today, so we increment AND freeze for if they miss tomorrow)
            await this.gamificationRepository.incrementStreak(userId, todayUtc);
        } else {
            // Beyond grace period - reset streak, start at 1
            await this.gamificationRepository.resetStreak(userId);
            await this.gamificationRepository.incrementStreak(userId, todayUtc);
            this.logger.log(
                `[updateStreak] Streak reset: userId=${userId} missed ${daysDiff} days`,
            );
        }
    }

    // -------------------------------------------------------------------------
    // processStreakReset (called by daily streak reset worker)
    // -------------------------------------------------------------------------

    /**
     *
     * For each user:
     *   - If within freeze window: activate freeze (set streak_freeze_until)
     *   - If freeze expired: reset streak to 0
     *
     * @inheritdoc
     */
    async processStreakReset(
        batchSize: number,
        offset: number,
    ): Promise<number> {
        const todayUtc = this.getTodayUtc();
        const users =
            await this.gamificationRepository.getUsersForStreakEvaluation(
                todayUtc,
                batchSize,
                offset,
            );

        for (const user of users) {
            const lastActive = user.last_active_date!;
            const freezeUntil = user.streak_freeze_until;
            const daysDiff = this.daysDiffUtc(lastActive, todayUtc);

            if (freezeUntil && freezeUntil >= todayUtc) {
                // Already frozen - do nothing, freeze is still active
                continue;
            }

            if (daysDiff <= STREAK_GRACE_DAYS + 1) {
                // Missed exactly one day - set freeze until tomorrow
                const tomorrowUtc = this.addDaysUtc(todayUtc, 1);
                await this.gamificationRepository.setStreakFreeze(
                    user.id,
                    tomorrowUtc,
                );
            } else {
                // Beyond grace period - reset streak
                await this.gamificationRepository.resetStreak(user.id);
                this.logger.log(
                    `[processStreakReset] Streak reset: userId=${user.id}`,
                );
            }
        }

        return users.length;
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Returns today's date in UTC as an ISO date string (YYYY-MM-DD).
     *
     * @returns ISO date string e.g. '2025-03-15'.
     */
    private getTodayUtc(): string {
        return new Date().toISOString().slice(0, 10);
    }

    /**
     * Computes the difference in calendar days between two ISO date strings.
     * Both inputs must be in YYYY-MM-DD format (UTC).
     *
     * @param fromDate Earlier date string.
     * @param toDate   Later date string.
     * @returns        Number of days difference (always >= 0).
     */
    private daysDiffUtc(fromDate: string, toDate: string): number {
        const from = new Date(fromDate + "T00:00:00Z").getTime();
        const to = new Date(toDate + "T00:00:00Z").getTime();
        return Math.round((to - from) / 86_400_000);
    }

    /**
     * Adds N days to an ISO date string and returns the result.
     *
     * @param dateStr ISO date string (YYYY-MM-DD).
     * @param days    Number of days to add.
     * @returns       New ISO date string.
     */
    private addDaysUtc(dateStr: string, days: number): string {
        const d = new Date(dateStr + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() + days);
        return d.toISOString().slice(0, 10);
    }

    /**
     * Increments topic affinity for all tags associated with a reel,
     * then refreshes the top_tags cache and updates leaderboard sorted sets.
     *
     * @param userId UUID of the user.
     * @param reelId UUID of the reel.
     */
    private async updateAffinityForReel(
        userId: string,
        reelId: string,
    ): Promise<void> {
        const reelTags =
            await this.gamificationRepository.getTagsForReel(reelId);

        if (reelTags.length === 0) return;

        for (const { tag_id } of reelTags) {
            await this.gamificationRepository.incrementTopicAffinity(
                userId,
                tag_id,
            );
        }
    }

    /**
     * Updates the weekly leaderboard sorted sets for a user's top N tags,
     * then refreshes the top_tags cache.
     *
     * @param userId    UUID of the user.
     * @param xpAmount  XP amount to add to leaderboard scores.
     */
    private async updateLeaderboardForUser(
        userId: string,
        xpAmount: number,
    ): Promise<void> {
        const topTagIds = await this.gamificationRepository.getTopTagIds(
            userId,
            LEADERBOARD_TOP_TAGS_COUNT,
        );

        for (const tagId of topTagIds) {
            await this.gamificationRepository.incrementLeaderboardScore(
                tagId,
                userId,
                xpAmount,
            );
        }

        // Refresh top_tags cache so UsersRepository.getLeaderboardRank reads fresh data
        await this.gamificationRepository.setTopTagsCache(userId, topTagIds);
    }
}
