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

import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { GamificationService } from "../gamification.service.abstract";
import { BadgeEvaluationJobPayload } from "../entities/gamification.entity";
import { QUEUES } from "@queues/queue-names";
import { GAMIFICATION_BADGE_JOBS } from "../gamification.constants";

/**
 * Worker that processes badge evaluation jobs from badge_evaluation_queue.
 */
@Processor(QUEUES.BADGE_EVALUATION)
export class BadgeEvaluationWorker extends WorkerHost {
    private readonly logger = new Logger(BadgeEvaluationWorker.name);

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
    async process(job: Job<BadgeEvaluationJobPayload>): Promise<void> {
        this.logger.debug(
            `[BadgeEvaluationWorker] Processing job ${job.id} name=${job.name} userId=${job.data.userId} event=${job.data.event}`,
        );

        switch (job.name) {
            case GAMIFICATION_BADGE_JOBS.BADGE_EVALUATION:
                await this.gamificationService.evaluateBadges(job.data);
                break;

            default:
                this.logger.warn(
                    `[BadgeEvaluationWorker] Unknown job name "${job.name}" - skipping.`,
                );
        }
    }
}
