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

import { Processor } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { GamificationService } from "../gamification.service.abstract";
import { XpAwardJobPayload } from "../entities/gamification.entity";
import { QUEUES } from "@queues/queue-names";
import { BaseWorker } from "@modules/messaging/base.worker";
import { GAMIFICATION_QUEUE_JOBS } from "@modules/messaging";

/**
 * Worker that processes XP award jobs from xp_award_queue.
 */
@Processor(QUEUES.XP_AWARD)
export class XpAwardWorker extends BaseWorker<XpAwardJobPayload> {
    /**
     * @param gamificationService Service containing awardXp business logic.
     */
    constructor(private readonly gamificationService: GamificationService) {
        super();
    }

    /**
     * payload is already unwrapped from AppMessage by BaseWorker.
     * Destructure directly - no job.data.payload nesting.
     */
    async handle(payload: XpAwardJobPayload, job: Job): Promise<void> {
        this.logger.debug(
            `Processing job ${job.id} name=${job.name} userId=${payload.userId}`,
        );
 
        switch (job.name) {
            case GAMIFICATION_QUEUE_JOBS.XP_AWARD:
                await this.gamificationService.awardXp(payload);
                break;
 
            default:
                this.logger.warn(`Unknown job name "${job.name}" - skipping.`);
        }
    }
}
