/**
 * @module modules/feed/workers/feed-build.worker
 * @description
 * BullMQ worker that consumes FEED_BUILD queue jobs.
 * All job reasons (new_user, cold_start, feed_low, search, share) pass
 * through the same pipeline - FeedBuilderService owns all logic.
 * The worker is intentionally thin: validate payload, delegate, log.
 *
 * Job payload shape:
 *   { userId: string, reason: FeedJobReason }
 */

import { Injectable, Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";

import { QUEUES } from "@queues/queue-names";
import { FeedBuilderService } from "../services/feed-builder.service";
import { FeedJobReason } from "../feed.constants";

/** Shape of every job payload on the FEED_BUILD queue. */
interface FeedBuildJobData {
    userId: string;
    reason: FeedJobReason;
}

/**
 * Consumes FEED_BUILD jobs and delegates to FeedBuilderService.
 */
@Processor(QUEUES.FEED_BUILD)
@Injectable()
export class FeedBuildWorker extends WorkerHost {
    private readonly logger = new Logger(FeedBuildWorker.name);

    /**
     * @param feedBuilder Orchestrates the full feed recommendation pipeline.
     */
    constructor(private readonly feedBuilder: FeedBuilderService) {
        super();
    }

    /**
     * Process a single FEED_BUILD job.
     * Validates the userId field is present, then delegates entirely
     * to FeedBuilderService.build(). All pipeline logic lives there.
     *
     * @param job BullMQ job carrying FeedBuildJobData.
     * @returns void
     */
    async process(job: Job<FeedBuildJobData>): Promise<void> {
        const { userId, reason } = job.data;

        if (!userId) {
            this.logger.warn(
                `FEED_BUILD job ${job.id} missing userId - skipping`,
            );
            return;
        }

        this.logger.debug(
            `Processing FEED_BUILD job ${job.id} userId=${userId} reason=${reason}`,
        );

        await this.feedBuilder.build(userId);

        this.logger.debug(
            `FEED_BUILD job ${job.id} complete userId=${userId} reason=${reason}`,
        );
    }
}
