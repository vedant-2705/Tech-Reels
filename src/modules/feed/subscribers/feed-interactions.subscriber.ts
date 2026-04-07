/**
 * @module modules/feed/subscribers/feed-interactions.subscriber
 * @description
 * Redis pub/sub subscriber for Feed module interaction and feed events.
 * Mirrors ReelInteractionsSubscriber exactly with two differences:
 *   1. Handler constructors receive (RedisService, Queue) instead of
 *      (RedisService, DatabaseService) - affinity handlers enqueue jobs.
 *   2. Subscribes to feed_events channel in addition to user_interactions
 *      and video_telemetry. FEED_LOW is handled inline (not via a handler
 *      class) since it only enqueues a FEED_BUILD job with no extra logic.
 *
 * Uses redis.client.duplicate() - pub/sub mode blocks the connection for
 * regular commands so it must never share with RedisService.client.
 *
 * To add a new affinity handler:
 *   1. Create a handler file implementing IFeedEventHandler.
 *   2. Call FeedEventRegistry.register() at the bottom of that file.
 *   3. Import the handler file in the self-registering imports section below.
 *   No other changes required.
 */

import { Injectable } from "@nestjs/common";

import { RedisService } from "@redis/redis.service";

import { FeedEventRegistry } from "../events/registry/feed-event.registry";
import { IFeedEventHandler } from "../events/handlers/ifeed-event-handler.interface";
import { FEED_MODULE_CONSTANTS, FEED_JOB_REASONS } from "../feed.constants";

// ---------------------------------------------------------------------------
// Self-registering imports
// Importing each file triggers its FeedEventRegistry.register() side effect.
// Add one import line here when adding a new handler - nothing else changes.
// ---------------------------------------------------------------------------
import "../events/handlers/watch-ended-affinity.handler";
import "../events/handlers/reel-liked-affinity.handler";
import "../events/handlers/reel-unliked-affinity.handler";
import "../events/handlers/reel-saved-affinity.handler";
import "../events/handlers/reel-unsaved-affinity.handler";
import "../events/handlers/reel-shared-affinity.handler";
import {
    AppMessage,
    BaseSubscriber,
    MessagingService,
} from "@modules/messaging";
import { REELS_MANIFEST } from "@modules/reels/reels.messaging";
import { FEED_MANIFEST } from "../feed.messaging";

/**
 * Manages a dedicated Redis subscriber connection for Feed module events.
 * Routes incoming messages to affinity handler instances via FeedEventRegistry.
 * Handles FEED_LOW inline without a dedicated handler class.
 */
@Injectable()
export class FeedInteractionsSubscriber extends BaseSubscriber {
    /** Instantiated handler map built during onModuleInit. */
    private readonly instances = new Map<string, IFeedEventHandler>();

    /**
     * @param redis Shared Redis service - client.duplicate() used for subscriber conn.
     * @param messagingService Used by handlers to dispatch FEED_BUILD jobs in response to affinity events.
     */
    constructor(
        redisService: RedisService,
        private readonly messagingService: MessagingService,
    ) {
        super(redisService);
    }

    // -------------------------------------------------------------------------
    // Channel declaration
    // -------------------------------------------------------------------------

    /**
     * Channels derived from FeedEventRegistry (user_interactions, video_telemetry)
     * plus feed_events which is handled inline and not in the registry.
     */
    protected channels(): string[] {
        const registryChannels = FeedEventRegistry.getChannels();
        return [
            ...new Set([
                ...registryChannels,
                FEED_MODULE_CONSTANTS.FEED_EVENTS,
            ]),
        ];
    }

    /**
     * Instantiate all registered handlers with injected deps, then subscribe
     * to all required channels. Called automatically by NestJS on module init.
     *
     * @returns void
     */
    async onModuleInit(): Promise<void> {
        for (const [key, HandlerClass] of FeedEventRegistry.getHandlers()) {
            const instance = new HandlerClass(
                this.redisService,
                this.messagingService,
            );
            this.instances.set(key, instance);
        }

        // Delegate connection + subscription to BaseSubscriber
        await super.onModuleInit();
    }

    // -------------------------------------------------------------------------
    // Routing
    // -------------------------------------------------------------------------

    /**
     * Routes AppMessage envelopes to the correct handler.
     * Routing key: `{channel}:{message.type}` - matches registry key format.
     *
     * FEED_LOW is handled inline before registry lookup.
     * Unhandled keys are silently ignored (other modules share channels).
     */
    protected async route(
        channel: string,
        message: AppMessage<unknown>,
    ): Promise<void> {
        // Inline handler: FEED_LOW - dispatch a FEED_BUILD job
        if (
            channel === FEED_MODULE_CONSTANTS.FEED_EVENTS &&
            message.type === REELS_MANIFEST.events.FEED_LOW.eventType
        ) {
            await this.handleFeedLow(message);
            return;
        }

        // Registry dispatch: all affinity events
        const key = `${channel}:${message.type}`;
        const handler = this.instances.get(key);

        if (!handler) {
            // Not an error - other modules publish to the same channels
            return;
        }

        await handler.handle(message);
    }

    /**
     * Handle FEED_LOW event inline.
     * Checks for an existing waiting or active FEED_BUILD job for this user
     * before enqueuing a new one (circuit breaker - prevents job pile-up
     * when a user is actively scrolling and triggering multiple FEED_LOW events).
     *
     * @param message AppMessage envelope containing FEED_LOW payload with userId and remaining feed count.
     * @returns void
     */
    private async handleFeedLow(message: AppMessage<unknown>): Promise<void> {
        const payload = message.payload as { userId?: string };
        const userId = payload["userId"] as string | undefined;

        if (!userId) {
            this.logger.warn("FEED_LOW payload missing userId - skipping");
            return;
        }

        try {
            // Circuit breaker: check for existing waiting jobs for this user.

            await this.messagingService.dispatchJob(
                FEED_MANIFEST.jobs.FEED_LOW_REBUILD.jobName,
                { userId, reason: FEED_JOB_REASONS.FEED_LOW },
                { jobId: `feed_low-${userId}` }, // BullMQ dedup: ignored if already queued
            );

            this.logger.debug(
                `FEED_BUILD enqueued for userId=${userId} reason=feed_low`,
            );
        } catch (err) {
            this.logger.error(
                `handleFeedLow failed for userId=${userId}: ${(err as Error).message}`,
            );
        }
    }
}
