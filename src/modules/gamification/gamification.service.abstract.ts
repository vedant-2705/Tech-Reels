/**
 * @module modules/gamification/gamification.service.abstract
 * @description
 * Abstract class contract for the gamification application service.
 *
 * This module has no HTTP controller - the abstract class is consumed
 * exclusively by BullMQ workers (XpAwardWorker, BadgeEvaluationWorker,
 * StreakResetWorker, LeaderboardResetWorker) and the GamificationSubscriber.
 *
 * DI is wired in GamificationModule so `GamificationService` (token)
 * resolves to `GamificationServiceImpl` (concrete class).
 */

import {
    AwardedBadgePayload,
} from "./entities/gamification.entity";
import { BadgeEvaluationJobPayload, XpAwardJobPayload } from "./gamification.interface";

export abstract class GamificationService {
    /**
     * Awards XP (and tokens where applicable) to a user for a given source.
     *
     * @param payload xp_award_queue job payload.
     */
    abstract awardXp(payload: XpAwardJobPayload): Promise<void>;

    /**
     * Evaluate badge criteria for a user and award any newly eligible badges.
     *
     * @param payload badge_evaluation_queue job payload.
     * @returns Array of awarded badge payloads (may be empty).
     */
    abstract evaluateBadges(
        payload: BadgeEvaluationJobPayload,
    ): Promise<AwardedBadgePayload[]>;

    /**
     * Increment or freeze a user's daily watch streak.
     * Called after a REEL_WATCH_ENDED event.
     *
     * @param userId UUID of the user.
     */
    abstract updateStreak(userId: string): Promise<void>;

    /**
     * Perform the scheduled daily streak reset pass for a batch of users.
     * Batch-processes streak resets for users who did not watch yesterday.
     * Called by the StreakResetWorker on its daily repeatable job.
     *
     * @param batchSize Number of users per batch.
     * @param offset    Pagination offset for this batch run.
     * @returns         Number of users processed in this batch.
     */
    abstract processStreakReset(
        batchSize: number,
        offset: number,
    ): Promise<number>;
}
