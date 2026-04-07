/**
 * @module modules/gamification/workers/badge-evaluation.worker
 * @description
 * BullMQ processor for the badge_evaluation_queue.
 * Consumes { userId, event, meta } job payloads and delegates to
 * GamificationService.evaluateBadges().
 *
 * Retry behaviour: evaluateBadges is idempotent via the distributed lock
 * and ON CONFLICT DO NOTHING on user_badges insert - safe to retry.
 */

import { Processor } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { GamificationService } from "../gamification.service.abstract";
import { BadgeEvaluationJobPayload } from "../gamification.interface";
import { QUEUES } from "@queues/queue-names";
import { GAMIFICATION_BADGE_JOBS } from "../gamification.constants";
import { BaseWorker } from "@modules/messaging";

/**
 * Worker that processes badge evaluation jobs from badge_evaluation_queue.
 */
@Processor(QUEUES.BADGE_EVALUATION)
export class BadgeEvaluationWorker extends BaseWorker<BadgeEvaluationJobPayload> {
    /**
     * @param gamificationService Service containing evaluateBadges business logic.
     */
    constructor(private readonly gamificationService: GamificationService) {
        super();
    }

    /**
     * Dispatches incoming jobs to the appropriate handler.
     *
     * @param job BullMQ job with name and data.
     */
    async handle(payload: BadgeEvaluationJobPayload, job: Job): Promise<void> {
        this.logger.debug(
            `Processing job ${job.id} name=${job.name} userId=${payload.userId} event=${payload.event}`,
        );

        switch (job.name) {
            case GAMIFICATION_BADGE_JOBS.BADGE_EVALUATION:
                await this.gamificationService.evaluateBadges(payload);
                break;

            default:
                this.logger.warn(`Unknown job name "${job.name}" - skipping.`);
        }
    }
}
