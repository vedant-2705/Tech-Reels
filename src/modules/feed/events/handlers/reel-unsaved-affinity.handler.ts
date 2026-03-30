/**
 * @module modules/feed/events/handlers/reel-unsaved-affinity.handler
 * @description
 * Handles REEL_UNSAVED events on the user_interactions channel.
 * Enqueues an AFFINITY_UPDATE job so the worker can apply the UNSAVE delta
 * (-1.5) to all tags associated with the unsaved reel.
 *
 * Self-registers into FeedEventRegistry at module load time.
 * Import this file in feed-interactions.subscriber.ts to activate.
 */

import { Logger } from "@nestjs/common";
import { Queue } from "bullmq";

import { RedisService } from "@redis/redis.service";
import { QUEUES } from "@queues/queue-names";

import {
    IFeedEventHandler,
    FeedEventPayload,
} from "./ifeed-event-handler.interface";
import { FeedEventRegistry } from "../registry/feed-event.registry";
import { FEED_MODULE_CONSTANTS } from "../../feed.constants";

/** Typed payload for REEL_UNSAVED events. */
interface ReelUnsavedPayload extends FeedEventPayload {
    userId: string;
    reelId: string;
    timestamp: string;
}

/**
 * Handles REEL_UNSAVED pub/sub events for affinity updates.
 * Instantiated by FeedInteractionsSubscriber with injected deps.
 */
export class ReelUnsavedAffinityHandler implements IFeedEventHandler {
    readonly channel = FEED_MODULE_CONSTANTS.USER_INTERACTIONS;
    readonly event = FEED_MODULE_CONSTANTS.REEL_UNSAVED;

    private readonly logger = new Logger(ReelUnsavedAffinityHandler.name);

    /**
     * @param _redis Reserved for future Redis-side operations.
     * @param affinityQueue AFFINITY_UPDATE BullMQ queue for job enqueue.
     */
    constructor(
        private readonly _redis: RedisService,
        private readonly affinityQueue: Queue,
    ) {}

    /**
     * Handle REEL_UNSAVED - enqueue affinity update job.
     * No completion_pct field - worker applies flat UNSAVE delta (-1.5).
     *
     * @param payload Parsed REEL_UNSAVED payload.
     * @returns void
     */
    async handle(payload: FeedEventPayload): Promise<void> {
        const { userId, reelId } = payload as ReelUnsavedPayload;

        try {
            await this.affinityQueue.add(QUEUES.AFFINITY_UPDATE, {
                userId,
                reelId,
                eventType: FEED_MODULE_CONSTANTS.REEL_UNSAVED,
            });
        } catch (err) {
            this.logger.error(
                `Failed to enqueue AFFINITY_UPDATE for REEL_UNSAVED userId=${userId} reelId=${reelId}: ${(err as Error).message}`,
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Self-registration
// ---------------------------------------------------------------------------
FeedEventRegistry.register(
    FEED_MODULE_CONSTANTS.USER_INTERACTIONS,
    FEED_MODULE_CONSTANTS.REEL_UNSAVED,
    ReelUnsavedAffinityHandler,
);
