/**
 * @module modules/gamification/workers/xp-award.worker
 * @description
 * BullMQ processor for the xp_award_queue.
 * Consumes { userId, source, xp_amount, reference_id?, note? } job payloads
 * and delegates to GamificationService.awardXp().
 *
 * Retry behaviour: BullMQ retries failed jobs automatically.
 * awardXp is idempotent via XP deduplication - safe to retry.
 */

import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { GamificationService } from "../gamification.service.abstract";
import { XpAwardJobPayload } from "../entities/gamification.entity";
import { QUEUES } from "@queues/queue-names";
import { GAMIFICATION_XP_JOBS } from "../gamification.constants";

/**
 * Worker that processes XP award jobs from xp_award_queue.
 */
@Processor(QUEUES.XP_AWARD)
export class XpAwardWorker extends WorkerHost {
    private readonly logger = new Logger(XpAwardWorker.name);

    /**
     * @param gamificationService Service containing awardXp business logic.
     */
    constructor(private readonly gamificationService: GamificationService) {
        super();
    }

    /**
     * Dispatches incoming jobs to the appropriate handler.
     *
     * @param job BullMQ job with name and data.
     */
    async process(job: Job<XpAwardJobPayload>): Promise<void> {
        this.logger.debug(
            `[XpAwardWorker] Processing job ${job.id} name=${job.name} userId=${job.data.userId}`,
        );

        switch (job.name) {
            case GAMIFICATION_XP_JOBS.XP_AWARD:
                await this.gamificationService.awardXp(job.data);
                break;

            default:
                this.logger.warn(
                    `[XpAwardWorker] Unknown job name "${job.name}" - skipping.`,
                );
        }
    }
}
