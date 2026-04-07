/**
 * @module modules/feed/events/handlers/watch-ended-affinity.handler
 * @description
 * Handles REEL_WATCH_ENDED events on the video_telemetry channel.
 * Enqueues an AFFINITY_UPDATE job carrying the watch completion percentage
 * so the worker can determine the correct delta tier (high/mid/low).
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
import { AffinityUpdateJobPayload } from "@modules/feed/feed.interface";
import { REELS_MANIFEST } from "@modules/reels/reels.messaging";
import { FEED_MANIFEST } from "@modules/feed/feed.messaging";
import { ReelWatchEndedEventPayload } from "@modules/reels/reels.interface";

/**
 * Handles REEL_WATCH_ENDED pub/sub events for affinity updates.
 * Instantiated by FeedInteractionsSubscriber with injected deps.
 */
export class WatchEndedAffinityHandler implements IFeedEventHandler {
    readonly channel = FEED_MODULE_CONSTANTS.VIDEO_TELEMETRY;
    readonly event = REELS_MANIFEST.events.REEL_WATCH_ENDED.eventType;

    private readonly logger = new Logger(WatchEndedAffinityHandler.name);

    /**
     * @param _redis Reserved for future Redis-side operations.
     * @param messagingService Service for dispatching messages.
     */
    constructor(
        private readonly _redis: RedisService,
        private readonly messagingService: MessagingService,
    ) {}

    /**
     * Handle REEL_WATCH_ENDED - enqueue affinity update job with completion_pct.
     * The worker determines the delta tier (WATCH_HIGH/MID/LOW) from completion_pct.
     *
     * @param message The incoming message.
     * @returns void
     */
    async handle(message: AppMessage<unknown>): Promise<void> {
        const { userId, reelId, completion_pct } =
            message.payload as ReelWatchEndedEventPayload;

        const payload: AffinityUpdateJobPayload = {
            userId,
            reelId,
            eventType: REELS_MANIFEST.events.REEL_WATCH_ENDED.eventType,
            completion_pct,
        };

        try {
            void this.messagingService.dispatchJob(
                FEED_MANIFEST.jobs.AFFINITY_UPDATE.jobName,
                payload,
            );
        } catch (err) {
            this.logger.error(
                `Failed to enqueue AFFINITY_UPDATE for REEL_WATCH_ENDED userId=${userId} reelId=${reelId}: ${(err as Error).message}`,
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Self-registration
// Runs once when this file is imported by feed-interactions.subscriber.ts.
// ---------------------------------------------------------------------------
FeedEventRegistry.register(
    FEED_MODULE_CONSTANTS.VIDEO_TELEMETRY,
    REELS_MANIFEST.events.REEL_WATCH_ENDED.eventType,
    WatchEndedAffinityHandler,
);
