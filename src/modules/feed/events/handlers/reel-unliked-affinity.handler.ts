/**
 * @module modules/feed/events/handlers/reel-unliked-affinity.handler
 * @description
 * Handles REEL_UNLIKED events on the user_interactions channel.
 * Enqueues an AFFINITY_UPDATE job so the worker can apply the UNLIKE delta
 * (-1.0) to all tags associated with the unliked reel.
 *
 * Self-registers into FeedEventRegistry at module load time.
 * Import this file in feed-interactions.subscriber.ts to activate.
 */

import { Logger } from "@nestjs/common";

import { RedisService } from "@redis/redis.service";

import { IFeedEventHandler } from "./ifeed-event-handler.interface";
import { FeedEventRegistry } from "../registry/feed-event.registry";
import { FEED_MODULE_CONSTANTS } from "../../feed.constants";
import { AppMessage, MessagingService } from "@modules/messaging";
import { ReelUnlikedEventPayload } from "@modules/reels/reels.interface";
import { AffinityUpdateJobPayload } from "@modules/feed/feed.interface";
import { REELS_MANIFEST } from "@modules/reels/reels.messaging";
import { FEED_MANIFEST } from "@modules/feed/feed.messaging";

/**
 * Handles REEL_UNLIKED pub/sub events for affinity updates.
 * Instantiated by FeedInteractionsSubscriber with injected deps.
 */
export class ReelUnlikedAffinityHandler implements IFeedEventHandler {
    readonly channel = FEED_MODULE_CONSTANTS.USER_INTERACTIONS;
    readonly event = REELS_MANIFEST.events.REEL_UNLIKED.eventType;

    private readonly logger = new Logger(ReelUnlikedAffinityHandler.name);

    /**
     * @param _redis Reserved for future Redis-side operations.
     * @param messagingService Service for dispatching messages.
     */
    constructor(
        private readonly _redis: RedisService,
        private readonly messagingService: MessagingService,
    ) {}

    /**
     * Handle REEL_UNLIKED - enqueue affinity update job.
     * No completion_pct field - worker applies flat UNLIKE delta (-1.0).
     *
     * @param message The incoming message.
     * @returns void
     */
    async handle(message: AppMessage<unknown>): Promise<void> {
        const { userId, reelId } = message.payload as ReelUnlikedEventPayload;

        const payload: AffinityUpdateJobPayload = {
            userId,
            reelId,
            eventType: REELS_MANIFEST.events.REEL_UNLIKED.eventType,
        };
        try {
            void this.messagingService.dispatchJob(
                FEED_MANIFEST.jobs.AFFINITY_UPDATE.jobName,
                payload,
            );
        } catch (err) {
            this.logger.error(
                `Failed to enqueue AFFINITY_UPDATE for REEL_UNLIKED userId=${userId} reelId=${reelId}: ${(err as Error).message}`,
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Self-registration
// ---------------------------------------------------------------------------
FeedEventRegistry.register(
    FEED_MODULE_CONSTANTS.USER_INTERACTIONS,
    REELS_MANIFEST.events.REEL_UNLIKED.eventType,
    ReelUnlikedAffinityHandler,
);
