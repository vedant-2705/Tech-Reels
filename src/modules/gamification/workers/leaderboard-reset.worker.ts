/**
 * @module modules/gamification/workers/leaderboard-reset.worker
 * @description
 * BullMQ processor for the leaderboard_reset_queue.
 * Runs a single repeatable job every Monday at 00:00 UTC.
 *
 * The repeatable job is scheduled by GamificationModule.onModuleInit()
 * via this worker's onModuleInit hook.
 *
 * On execution:
 *   1. Deletes all leaderboard:weekly:* sorted set keys from Redis.
 *   2. Logs completion.
 *
 * The reset is a hard wipe - all weekly scores return to zero.
 * Historical leaderboard data is not persisted (out of scope for now).
 *
 * Job name: GAMIFICATION_LEADERBOARD_JOBS.WEEKLY_LEADERBOARD_RESET
 * Payload:  {} (no payload needed)
 */

import { Processor, InjectQueue } from "@nestjs/bullmq";
import { OnModuleInit } from "@nestjs/common";
import { Job, Queue } from "bullmq";
import { GamificationRepository } from "../gamification.repository";
import { QUEUES } from "@queues/queue-names";
import {
    GAMIFICATION_LEADERBOARD_JOBS,
    LEADERBOARD_RESET_CRON,
} from "../gamification.constants";
import { BaseWorker } from "@modules/messaging";
import { WeeklyLeaderboardResetJobPayload } from "../gamification.interface";

/**
 * Worker that processes the weekly leaderboard reset repeatable job.
 */
@Processor(QUEUES.LEADERBOARD_RESET)
export class LeaderboardResetWorker
    extends BaseWorker<WeeklyLeaderboardResetJobPayload>
    implements OnModuleInit
{
    /**
     * @param gamificationRepository Repository with resetWeeklyLeaderboard method.
     * @param leaderboardResetQueue  Injected queue to schedule the repeatable job.
     */
    constructor(
        private readonly gamificationRepository: GamificationRepository,
        // @InjectQueue kept intentionally — used for self-scheduling the
        // repeatable weekly job, NOT for dispatching outbound jobs.
        @InjectQueue(QUEUES.LEADERBOARD_RESET)
        private readonly leaderboardResetQueue: Queue,
    ) {
        super();
    }

    /**
     * Schedules the weekly leaderboard reset repeatable job on module init.
     * upsertJobScheduler is idempotent - safe to call on every pod start.
     */
    async onModuleInit(): Promise<void> {
        await this.leaderboardResetQueue.upsertJobScheduler(
            GAMIFICATION_LEADERBOARD_JOBS.WEEKLY_LEADERBOARD_RESET,
            { pattern: LEADERBOARD_RESET_CRON },
            {
                name: GAMIFICATION_LEADERBOARD_JOBS.WEEKLY_LEADERBOARD_RESET,
                data: {},
                opts: {
                    removeOnComplete: 5,
                    removeOnFail: 20,
                },
            },
        );

        this.logger.log(
            `Repeatable job scheduled: ${LEADERBOARD_RESET_CRON} UTC (every Monday)`,
        );
    }

    /**
     * Executes the weekly leaderboard reset by deleting all
     * leaderboard:weekly:* keys from Redis.
     *
     * @param job BullMQ repeatable job (payload is empty).
     */
    async handle(_payload: Record<string, never>, job: Job): Promise<void> {
        this.logger.log(`Starting weekly leaderboard reset job ${job.id}`);

        await this.gamificationRepository.resetWeeklyLeaderboard();

        this.logger.log(
            "Weekly leaderboard reset complete. All leaderboard:weekly:* keys deleted.",
        );
    }
}
