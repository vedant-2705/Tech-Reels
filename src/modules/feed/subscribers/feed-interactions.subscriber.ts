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

import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

import { RedisService } from "@redis/redis.service";
import { QUEUES } from "@queues/queue-names";

import { FeedEventRegistry } from "../events/registry/feed-event.registry";
import {
    IFeedEventHandler,
    FeedEventPayload,
} from "../events/handlers/ifeed-event-handler.interface";
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

/**
 * Manages a dedicated Redis subscriber connection for Feed module events.
 * Routes incoming messages to affinity handler instances via FeedEventRegistry.
 * Handles FEED_LOW inline without a dedicated handler class.
 */
@Injectable()
export class FeedInteractionsSubscriber
    implements OnModuleInit, OnModuleDestroy
{
    private readonly logger = new Logger(FeedInteractionsSubscriber.name);

    /** Dedicated Redis connection - never shared with RedisService.client. */
    private subscriber!: Redis;

    /** Instantiated handler map built during onModuleInit. */
    private readonly instances = new Map<string, IFeedEventHandler>();

    /**
     * @param redis Shared Redis service - client.duplicate() used for subscriber conn.
     * @param affinityQueue AFFINITY_UPDATE queue - passed to handler constructors.
     * @param feedBuildQueue FEED_BUILD queue - used inline for FEED_LOW handling.
     */
    constructor(
        private readonly redis: RedisService,
        @InjectQueue(QUEUES.AFFINITY_UPDATE)
        private readonly affinityQueue: Queue,
        @InjectQueue(QUEUES.FEED_BUILD)
        private readonly feedBuildQueue: Queue,
    ) {}

    /**
     * Instantiate all registered handlers with injected deps, then subscribe
     * to all required channels. Called automatically by NestJS on module init.
     *
     * @returns void
     */
    async onModuleInit(): Promise<void> {
        // Instantiate every registered handler constructor with injected deps.
        // Handlers receive RedisService + affinityQueue (not DatabaseService).
        for (const [key, HandlerClass] of FeedEventRegistry.getHandlers()) {
            const instance = new HandlerClass(this.redis, this.affinityQueue);
            this.instances.set(key, instance);
        }

        // Dedicated connection - duplicate() copies config from shared client.
        // pub/sub mode blocks regular commands on the connection it runs on.
        this.subscriber = this.redis.client.duplicate();

        this.subscriber.on("error", (err: Error) => {
            this.logger.error(
                `[FeedInteractionsSubscriber] Redis error: ${err.message}`,
            );
        });

        // Derive channels from registry (user_interactions, video_telemetry)
        // and add feed_events manually - FEED_LOW is handled inline, so the
        // registry never emits feed_events from getChannels().
        const registryChannels = FeedEventRegistry.getChannels();
        const allChannels = [
            ...new Set([
                ...registryChannels,
                FEED_MODULE_CONSTANTS.FEED_EVENTS,
            ]),
        ];

        await this.subscriber.subscribe(...allChannels);

        this.subscriber.on("message", (channel: string, message: string) => {
            void this.onMessage(channel, message);
        });

        this.logger.log(`Subscribed to channels: ${allChannels.join(", ")}`);
    }

    /**
     * Route incoming pub/sub message to the correct handler.
     * FEED_LOW on feed_events is handled inline - enqueues FEED_BUILD job
     * with a circuit breaker check to prevent job pile-up.
     * All other events are routed via FeedEventRegistry to handler instances.
     * Malformed messages are logged and swallowed - never throw from here.
     *
     * @param channel Redis pub/sub channel name.
     * @param message Raw JSON string payload.
     * @returns void
     */
    private async onMessage(channel: string, message: string): Promise<void> {
        let parsed: FeedEventPayload | null = null;

        try {
            parsed = JSON.parse(message) as FeedEventPayload;
        } catch {
            this.logger.warn(
                `Failed to parse message on channel "${channel}": ${message}`,
            );
            return;
        }

        const event = parsed?.event;
        if (!event) {
            this.logger.warn(`Missing event field on channel "${channel}"`);
            return;
        }

        // ---------------------------------------------------------------------------
        // Inline handler: FEED_LOW
        // Too simple to warrant a dedicated handler class - just enqueue FEED_BUILD.
        // Circuit breaker: skip if a job for this userId is already waiting/active.
        // ---------------------------------------------------------------------------
        if (
            channel === FEED_MODULE_CONSTANTS.FEED_EVENTS &&
            event === FEED_MODULE_CONSTANTS.FEED_LOW
        ) {
            await this.handleFeedLow(parsed);
            return;
        }

        // ---------------------------------------------------------------------------
        // Registry dispatch: all affinity events
        // ---------------------------------------------------------------------------
        const key = `${channel}:${event}`;
        const handler = this.instances.get(key);

        if (!handler) {
            // Not an error - other modules publish to the same channels.
            return;
        }

        try {
            await handler.handle(parsed);
        } catch (err) {
            this.logger.error(
                `Handler failed for key "${key}": ${(err as Error).message}`,
            );
        }
    }

    /**
     * Handle FEED_LOW event inline.
     * Checks for an existing waiting or active FEED_BUILD job for this user
     * before enqueuing a new one (circuit breaker - prevents job pile-up
     * when a user is actively scrolling and triggering multiple FEED_LOW events).
     *
     * @param payload Parsed FEED_LOW payload containing userId.
     * @returns void
     */
    private async handleFeedLow(payload: FeedEventPayload): Promise<void> {
        const userId = payload["userId"] as string | undefined;

        if (!userId) {
            this.logger.warn("FEED_LOW payload missing userId - skipping");
            return;
        }

        try {
            // Circuit breaker: check for existing waiting jobs for this user.
            // getJobs(['waiting', 'active']) returns jobs currently in the queue.
            // We match on job.data.userId to avoid rebuilding for the same user.
            const waitingJobs = await this.feedBuildQueue.getJobs([
                "waiting",
                "active",
            ]);

            const alreadyQueued = waitingJobs.some(
                (job) => job.data?.userId === userId,
            );

            if (alreadyQueued) {
                this.logger.debug(
                    `FEED_LOW skipped - build job already queued for userId=${userId}`,
                );
                return;
            }

            await this.feedBuildQueue.add(QUEUES.FEED_BUILD, {
                userId,
                reason: FEED_JOB_REASONS.FEED_LOW,
            });

            this.logger.debug(
                `FEED_BUILD enqueued for userId=${userId} reason=feed_low`,
            );
        } catch (err) {
            this.logger.error(
                `handleFeedLow failed for userId=${userId}: ${(err as Error).message}`,
            );
        }
    }

    /**
     * Gracefully disconnect the dedicated subscriber connection on shutdown.
     *
     * @returns void
     */
    async onModuleDestroy(): Promise<void> {
        await this.subscriber.quit();
    }
}
