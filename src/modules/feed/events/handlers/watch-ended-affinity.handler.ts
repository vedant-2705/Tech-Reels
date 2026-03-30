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
import { Queue } from "bullmq";

import { RedisService } from "@redis/redis.service";
import { QUEUES } from "@queues/queue-names";

import {
    IFeedEventHandler,
    FeedEventPayload,
} from "./ifeed-event-handler.interface";
import { FeedEventRegistry } from "../registry/feed-event.registry";
import { FEED_MODULE_CONSTANTS } from "../../feed.constants";

/** Typed payload for REEL_WATCH_ENDED events. */
interface ReelWatchEndedPayload extends FeedEventPayload {
    userId: string;
    reelId: string;
    completion_pct: number;
    timestamp: string;
}

/**
 * Handles REEL_WATCH_ENDED pub/sub events for affinity updates.
 * Instantiated by FeedInteractionsSubscriber with injected deps.
 */
export class WatchEndedAffinityHandler implements IFeedEventHandler {
    readonly channel = FEED_MODULE_CONSTANTS.VIDEO_TELEMETRY;
    readonly event = FEED_MODULE_CONSTANTS.REEL_WATCH_ENDED;

    private readonly logger = new Logger(WatchEndedAffinityHandler.name);

    /**
     * @param _redis Reserved for future Redis-side operations.
     * @param affinityQueue AFFINITY_UPDATE BullMQ queue for job enqueue.
     */
    constructor(
        private readonly _redis: RedisService,
        private readonly affinityQueue: Queue,
    ) {}

    /**
     * Handle REEL_WATCH_ENDED - enqueue affinity update job with completion_pct.
     * The worker determines the delta tier (WATCH_HIGH/MID/LOW) from completion_pct.
     *
     * @param payload Parsed REEL_WATCH_ENDED payload.
     * @returns void
     */
    async handle(payload: FeedEventPayload): Promise<void> {
        const { userId, reelId, completion_pct } =
            payload as ReelWatchEndedPayload;

        try {
            await this.affinityQueue.add(QUEUES.AFFINITY_UPDATE, {
                userId,
                reelId,
                eventType: FEED_MODULE_CONSTANTS.REEL_WATCH_ENDED,
                completion_pct,
            });
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
    FEED_MODULE_CONSTANTS.REEL_WATCH_ENDED,
    WatchEndedAffinityHandler,
);
