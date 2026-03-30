/**
 * @module modules/feed/crons/affinity-decay.cron
 * @description
 * Scheduled service that applies a weekly decay multiplier to all
 * user_topic_affinity scores. Keeps the feed fresh as user interests shift
 * over time - high scores from months ago gradually decay toward zero,
 * allowing newer interaction signals to dominate.
 *
 * Decay formula (applied in DB):
 *   new_score = GREATEST(0, ROUND(score * AFFINITY_DECAY_MULTIPLIER, 2))
 *
 * At 0.95 multiplier:
 *   After 1 week:  score × 0.95
 *   After 4 weeks: score × 0.81
 *   After 3 months: score × 0.54
 *
 * Uses an overlap guard - weekly cron should never overlap but guard is
 * included for safety consistency with other cron services.
 * ScheduleModule.forRoot() is registered in AppModule - not imported here.
 */

import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import { FeedRepository } from "../feed.repository";
import { AFFINITY_DECAY_MULTIPLIER } from "../feed.constants";

/**
 * Applies weekly affinity score decay across all users.
 */
@Injectable()
export class AffinityDecayCron {
    private readonly logger = new Logger(AffinityDecayCron.name);

    /** Prevents overlapping runs (safety guard - weekly schedule makes this unlikely). */
    private isRunning = false;

    /**
     * @param feedRepository Feed data-access layer for bulk affinity score updates.
     */
    constructor(private readonly feedRepository: FeedRepository) {}

    /**
     * Apply affinity decay to all user_topic_affinity rows every Sunday at 03:00 UTC.
     * Skips if previous run is still in progress.
     *
     * @returns void
     */
    @Cron("0 0 3 * * 0")
    async applyDecay(): Promise<void> {
        if (this.isRunning) {
            this.logger.warn(
                "AffinityDecayCron skipped - previous run still in progress",
            );
            return;
        }

        this.isRunning = true;

        try {
            await this.run();
        } catch (err) {
            this.logger.error(
                `AffinityDecayCron failed: ${(err as Error).message}`,
            );
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Core decay logic - delegates to repository for bulk UPDATE.
     *
     * @returns void
     */
    private async run(): Promise<void> {
        this.logger.log(
            `AffinityDecayCron starting - multiplier=${AFFINITY_DECAY_MULTIPLIER}`,
        );

        const updatedCount = await this.feedRepository.applyAffinityDecay(
            AFFINITY_DECAY_MULTIPLIER,
        );

        this.logger.log(
            `AffinityDecayCron complete - ${updatedCount} rows decayed`,
        );
    }
}
