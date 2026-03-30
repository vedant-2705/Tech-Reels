/**
 * @module modules/feed/events/handlers/reel-saved-affinity.handler
 * @description
 * Handles REEL_SAVED events on the user_interactions channel.
 * Enqueues an AFFINITY_UPDATE job so the worker can apply the SAVE delta
 * (+1.5) to all tags associated with the saved reel.
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

/** Typed payload for REEL_SAVED events. */
interface ReelSavedPayload extends FeedEventPayload {
    userId: string;
    reelId: string;
    timestamp: string;
}

/**
 * Handles REEL_SAVED pub/sub events for affinity updates.
 * Instantiated by FeedInteractionsSubscriber with injected deps.
 */
export class ReelSavedAffinityHandler implements IFeedEventHandler {
    readonly channel = FEED_MODULE_CONSTANTS.USER_INTERACTIONS;
    readonly event = FEED_MODULE_CONSTANTS.REEL_SAVED;

    private readonly logger = new Logger(ReelSavedAffinityHandler.name);

    /**
     * @param _redis Reserved for future Redis-side operations.
     * @param affinityQueue AFFINITY_UPDATE BullMQ queue for job enqueue.
     */
    constructor(
        private readonly _redis: RedisService,
        private readonly affinityQueue: Queue,
    ) {}

    /**
     * Handle REEL_SAVED - enqueue affinity update job.
     * No completion_pct field - worker applies flat SAVE delta (+1.5).
     *
     * @param payload Parsed REEL_SAVED payload.
     * @returns void
     */
    async handle(payload: FeedEventPayload): Promise<void> {
        const { userId, reelId } = payload as ReelSavedPayload;

        try {
            await this.affinityQueue.add(QUEUES.AFFINITY_UPDATE, {
                userId,
                reelId,
                eventType: FEED_MODULE_CONSTANTS.REEL_SAVED,
            });
        } catch (err) {
            this.logger.error(
                `Failed to enqueue AFFINITY_UPDATE for REEL_SAVED userId=${userId} reelId=${reelId}: ${(err as Error).message}`,
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Self-registration
// ---------------------------------------------------------------------------
FeedEventRegistry.register(
    FEED_MODULE_CONSTANTS.USER_INTERACTIONS,
    FEED_MODULE_CONSTANTS.REEL_SAVED,
    ReelSavedAffinityHandler,
);
