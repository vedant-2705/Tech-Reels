/**
 * @module modules/gamification/workers/streak-reset.worker
 * @description
 * BullMQ processor for the streak_reset_queue.
 * Handles two distinct job types on the same queue:
 *
 *   DAILY_STREAK_RESET  - Repeatable job, fires at 00:05 UTC daily.
 *                         Payload: {} (no userId).
 *                         Batch-processes ALL users whose streak needs
 *                         evaluation (missed a day, freeze expired, etc.).
 *
 *   UPDATE_USER_STREAK  - Per-user job, enqueued by GamificationSubscriber
 *                         on every REEL_WATCH_ENDED event.
 *                         Payload: { userId: string }.
 *                         Updates a single user's streak immediately.
 *
 * The repeatable DAILY_STREAK_RESET job is scheduled via upsertJobScheduler
 * in onModuleInit(). BullMQ repeatable jobs are Redis-coordinated -
 * only one fires regardless of pod count.
 */

import { Processor, InjectQueue } from "@nestjs/bullmq";
import { OnModuleInit } from "@nestjs/common";
import { Job, Queue } from "bullmq";
import { GamificationService } from "../gamification.service.abstract";
import { QUEUES } from "@queues/queue-names";
import {
    GAMIFICATION_STREAK_JOBS,
    STREAK_RESET_CRON,
    STREAK_RESET_BATCH_SIZE,
} from "../gamification.constants";
import { BaseWorker } from "@modules/messaging";

/** Payload for UPDATE_USER_STREAK jobs. */
interface UpdateUserStreakPayload {
    userId: string;
}

/** Payload for DAILY_STREAK_RESET jobs (scheduled, no input). */
type DailyStreakResetPayload = Record<string, never>;

/** Union of both payload shapes on this queue. */
type StreakJobPayload = UpdateUserStreakPayload | DailyStreakResetPayload;

/**
 * Worker that processes both daily batch streak resets and
 * per-user streak updates triggered by watch events.
 */
@Processor(QUEUES.STREAK_RESET)
export class StreakResetWorker
    extends BaseWorker<StreakJobPayload>
    implements OnModuleInit
{
    /**
     * @param gamificationService Service containing streak business logic.
     * @param streakResetQueue    Injected queue to schedule the repeatable job.
     */
    constructor(
        private readonly gamificationService: GamificationService,
        // @InjectQueue kept intentionally — used for self-scheduling the
        // repeatable daily job, NOT for dispatching outbound jobs.
        @InjectQueue(QUEUES.STREAK_RESET)
        private readonly streakResetQueue: Queue,
    ) {
        super();
    }

    /**
     * Schedules the daily streak reset repeatable job on module init.
     * upsertJobScheduler is idempotent - safe to call on every pod start.
     * Only one job fires regardless of how many pods are running
     * (BullMQ repeatable jobs are Redis-coordinated).
     */
    async onModuleInit(): Promise<void> {
        await this.streakResetQueue.upsertJobScheduler(
            GAMIFICATION_STREAK_JOBS.DAILY_STREAK_RESET,
            { pattern: STREAK_RESET_CRON },
            {
                name: GAMIFICATION_STREAK_JOBS.DAILY_STREAK_RESET,
                data: {},
                opts: {
                    removeOnComplete: 10,
                    removeOnFail: 50,
                },
            },
        );

        this.logger.log(
            `Daily batch job scheduled: cron="${STREAK_RESET_CRON}" UTC`,
        );
    }

    /**
     * Routes incoming jobs to the correct handler by job name.
     *
     * @param job BullMQ job - either daily batch or per-user update.
     */
    async handle(payload: StreakJobPayload, job: Job): Promise<void> {
        switch (job.name) {
            case GAMIFICATION_STREAK_JOBS.DAILY_STREAK_RESET:
                await this.handleDailyBatchReset(job);
                break;

            case GAMIFICATION_STREAK_JOBS.UPDATE_USER_STREAK:
                await this.handleUpdateUserStreak(
                    payload as UpdateUserStreakPayload,
                    job,
                );
                break;

            default:
                this.logger.warn(`Unknown job name "${job.name}" - skipping.`);
        }
    }

    // -------------------------------------------------------------------------
    // Private handlers
    // -------------------------------------------------------------------------

    /**
     * Batch-processes streak resets for all users who did not watch yesterday.
     * Iterates in pages until a page returns fewer rows than the batch size.
     *
     * @param job BullMQ repeatable job (payload is empty).
     */
    private async handleDailyBatchReset(job: Job): Promise<void> {
        this.logger.log(`Starting daily batch reset job ${job.id}`);

        let offset = 0;
        let totalProcessed = 0;
        let batchCount: number;

        do {
            batchCount = await this.gamificationService.processStreakReset(
                STREAK_RESET_BATCH_SIZE,
                offset,
            );
            totalProcessed += batchCount;
            offset += STREAK_RESET_BATCH_SIZE;

            this.logger.debug(
                `Batch complete: offset=${offset} count=${batchCount}`,
            );
        } while (batchCount === STREAK_RESET_BATCH_SIZE);

        this.logger.log(
            `Daily batch reset complete. Users processed: ${totalProcessed}`,
        );
    }

    /**
     * Updates the streak for a single user after a REEL_WATCH_ENDED event.
     * Delegates to GamificationService.updateStreak() which contains
     * all streak business logic including grace period handling.
     *
     * @param job BullMQ job with { userId } payload.
     */
    private async handleUpdateUserStreak(
        payload: UpdateUserStreakPayload,
        job: Job,
    ): Promise<void> {
        const { userId } = payload;

        if (!userId) {
            this.logger.warn(
                `UPDATE_USER_STREAK job ${job.id} missing userId - skipping.`,
            );
            return;
        }

        this.logger.debug(`Updating streak for userId=${userId}`);

        await this.gamificationService.updateStreak(userId);
    }
}
