/**
 * @module modules/reels/subscribers/reel-interactions.subscriber
 * @description
 * Redis pub/sub subscriber for Reels interaction events.
 * Imports handler files to trigger self-registration side effects,
 * then instantiates each registered handler with injected NestJS deps.
 * Subscribes to all channels derived from the registry.
 *
 * To add a new handler:
 *   1. Create a handler file in events/handlers/ implementing IReelEventHandler.
 *   2. Call ReelEventRegistry.register() at the bottom of that file.
 *   3. Import the handler file below in the self-registering imports section.
 *   No other changes required.
 *
 * Uses redis.client.duplicate() - pub/sub mode blocks the connection
 * for regular commands so it must never share with RedisService.client.
 */

import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from "@nestjs/common";
import { Redis } from "ioredis";

import { DatabaseService } from "@database/database.service";
import { RedisService } from "@redis/redis.service";

import { ReelEventRegistry } from "../events/registry/reel-event.registry";
import {
    IReelEventHandler,
    ReelEventPayload,
} from "../events/handlers/ireel-event-handler.interface";

// ---------------------------------------------------------------------------
// Self-registering imports
// Importing each file triggers its ReelEventRegistry.register() side effect.
// Add one import line here when adding a new handler - nothing else changes.
// ---------------------------------------------------------------------------
import "../events/handlers/reel-watch-ended.handler";
import "../events/handlers/reel-shared.handler";

/**
 * Manages a dedicated Redis subscriber connection.
 * Routes incoming messages to handler instances via ReelEventRegistry.
 */
@Injectable()
export class ReelInteractionsSubscriber
    implements OnModuleInit, OnModuleDestroy
{
    private readonly logger = new Logger(ReelInteractionsSubscriber.name);
    private subscriber!: Redis;

    /** Instantiated handler map built during onModuleInit. */
    private readonly instances = new Map<string, IReelEventHandler>();

    /**
     * @param redis Shared Redis service - client.duplicate() for subscriber conn.
     * @param db PostgreSQL service - passed to handler constructors.
     */
    constructor(
        private readonly redis: RedisService,
        private readonly db: DatabaseService,
    ) {}

    /**
     * Instantiate all registered handlers with deps, then subscribe to channels.
     */
    async onModuleInit(): Promise<void> {
        // Instantiate every registered handler constructor with injected deps
        for (const [key, HandlerClass] of ReelEventRegistry.getHandlers()) {
            const instance = new HandlerClass(this.redis, this.db);
            this.instances.set(key, instance);
        }

        // Dedicated connection - duplicate() copies config from shared client
        this.subscriber = this.redis.client.duplicate();

        this.subscriber.on("error", (err: Error) => {
            this.logger.error(
                `[ReelInteractionsSubscriber] Redis error: ${err.message}`,
            );
        });

        // Subscribe to all channels derived from registered handlers
        const channels = ReelEventRegistry.getChannels();
        await this.subscriber.subscribe(...channels);

        this.subscriber.on("message", (channel: string, message: string) => {
            void this.onMessage(channel, message);
        });

        this.logger.log(`Subscribed to channels: ${channels.join(", ")}`);
    }

    /**
     * Route incoming message to the correct handler instance.
     * Malformed messages are logged and swallowed - never throw from here.
     *
     * @param channel Redis pub/sub channel name.
     * @param message Raw JSON string payload.
     */
    private async onMessage(channel: string, message: string): Promise<void> {
        let parsed: ReelEventPayload | null = null;

        try {
            parsed = JSON.parse(message) as ReelEventPayload;
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

        const key = `${channel}:${event}`;
        const handler = this.instances.get(key);

        if (!handler) {
            // Not an error - other modules publish to same channels
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
     * Gracefully disconnect dedicated subscriber connection on shutdown.
     */
    async onModuleDestroy(): Promise<void> {
        await this.subscriber.quit();
    }
}
