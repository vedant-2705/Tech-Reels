/**
 * @module modules/feed/workers/affinity-update.worker
 * @description
 * BullMQ worker that consumes AFFINITY_UPDATE queue jobs.
 * Resolves the delta for the interaction event type, fetches the reel's
 * tag associations, and upserts the affinity score for each tag.
 *
 * All DB writes are parallel (Promise.all per tag). One tag failure does
 * not block others - errors are logged individually.
 *
 * Job payload shape:
 *   { userId, reelId, eventType, completion_pct?: number }
 */

import { Injectable, Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";

import { QUEUES } from "@queues/queue-names";
import { FeedRepository } from "../feed.repository";
import {
    AFFINITY_DELTAS,
    FEED_MODULE_CONSTANTS,
    WATCH_COMPLETION_THRESHOLDS,
} from "../feed.constants";

/** Shape of every job payload on the AFFINITY_UPDATE queue. */
interface AffinityUpdateJobData {
    userId: string;
    reelId: string;
    eventType: string;
    completion_pct?: number;
}

/**
 * Consumes AFFINITY_UPDATE jobs and applies per-tag affinity score deltas.
 */
@Processor(QUEUES.AFFINITY_UPDATE)
@Injectable()
export class AffinityUpdateWorker extends WorkerHost {
    private readonly logger = new Logger(AffinityUpdateWorker.name);

    /**
     * @param feedRepository Feed data-access layer for tag lookups and upserts.
     */
    constructor(private readonly feedRepository: FeedRepository) {
        super();
    }

    /**
     * Process a single AFFINITY_UPDATE job.
     * Steps:
     *   1. Resolve the affinity delta from eventType + completion_pct.
     *   2. Fetch tag IDs associated with the reel.
     *   3. Upsert delta for each tag in parallel.
     *
     * @param job BullMQ job carrying AffinityUpdateJobData.
     * @returns void
     */
    async process(job: Job<AffinityUpdateJobData>): Promise<void> {
        const { userId, reelId, eventType, completion_pct } = job.data;

        const delta = this.resolveDelta(eventType, completion_pct);

        if (delta === null) {
            this.logger.warn(
                `Unknown eventType "${eventType}" for userId=${userId} reelId=${reelId} - skipping`,
            );
            return;
        }

        // Fetch tag associations for this reel
        const tagPairs = await this.feedRepository.getReelTagIds([reelId]);

        if (tagPairs.length === 0) {
            this.logger.debug(
                `No tags found for reelId=${reelId} - no affinity update applied`,
            );
            return;
        }

        // Upsert delta for each tag in parallel - one failure must not block others
        await Promise.all(
            tagPairs.map(async ({ tagId }) => {
                try {
                    await this.feedRepository.upsertAffinityDelta(
                        userId,
                        tagId,
                        delta,
                    );
                } catch (err) {
                    this.logger.error(
                        `upsertAffinityDelta failed userId=${userId} tagId=${tagId} delta=${delta}: ${(err as Error).message}`,
                    );
                }
            }),
        );

        this.logger.debug(
            `Affinity updated userId=${userId} reelId=${reelId} eventType=${eventType} delta=${delta} tags=${tagPairs.length}`,
        );
    }

    /**
     * Resolve the affinity score delta for a given event type.
     * Watch events use completion_pct to determine the tier.
     * Returns null for unrecognised event types.
     *
     * @param eventType Event name string from the job payload.
     * @param completion_pct Optional watch completion percentage (0–100).
     * @returns Numeric delta or null if event type is unrecognised.
     */
    private resolveDelta(
        eventType: string,
        completion_pct?: number,
    ): number | null {
        switch (eventType) {
            case FEED_MODULE_CONSTANTS.REEL_WATCH_ENDED: {
                const pct = completion_pct ?? 0;
                if (pct >= WATCH_COMPLETION_THRESHOLDS.HIGH) {
                    return AFFINITY_DELTAS.WATCH_HIGH;
                }
                if (pct >= WATCH_COMPLETION_THRESHOLDS.MID) {
                    return AFFINITY_DELTAS.WATCH_MID;
                }
                return AFFINITY_DELTAS.WATCH_LOW;
            }
            case FEED_MODULE_CONSTANTS.REEL_LIKED:
                return AFFINITY_DELTAS.LIKE;
            case FEED_MODULE_CONSTANTS.REEL_UNLIKED:
                return AFFINITY_DELTAS.UNLIKE;
            case FEED_MODULE_CONSTANTS.REEL_SAVED:
                return AFFINITY_DELTAS.SAVE;
            case FEED_MODULE_CONSTANTS.REEL_UNSAVED:
                return AFFINITY_DELTAS.UNSAVE;
            case FEED_MODULE_CONSTANTS.REEL_SHARED:
                return AFFINITY_DELTAS.SHARE;
            default:
                return null;
        }
    }
}
