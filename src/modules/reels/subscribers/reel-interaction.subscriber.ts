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

import { Injectable } from "@nestjs/common";

import { DatabaseService } from "@database/database.service";
import { RedisService } from "@redis/redis.service";
import { AppMessage, BaseSubscriber } from "@modules/messaging";

import { ReelEventRegistry } from "../events/registry/reel-event.registry";
import { IReelEventHandler } from "../events/handlers/ireel-event-handler.interface";

// ---------------------------------------------------------------------------
// Self-registering imports
// Importing each file triggers its ReelEventRegistry.register() side effect.
// Add one import line here when adding a new handler - nothing else changes.
// ---------------------------------------------------------------------------
import "../events/handlers/reel-watch-ended.handler";
import "../events/handlers/reel-shared.handler";
import "../events/handlers/reel-cache-warm.handler";

/**
 * Manages a dedicated Redis subscriber connection.
 * Routes incoming messages to handler instances via ReelEventRegistry.
 */
@Injectable()
export class ReelInteractionsSubscriber extends BaseSubscriber {
    /** Instantiated handler map built during onModuleInit. */
    private readonly instances = new Map<string, IReelEventHandler>();

    /**
     * @param redis Shared Redis service - client.duplicate() for subscriber conn.
     * @param db PostgreSQL service - passed to handler constructors.
     */
    constructor(
        redisService: RedisService,
        private readonly db: DatabaseService,
    ) {
        super(redisService);
    }

    /**
     * Declare channels derived from registered handlers.
     * Called once by BaseSubscriber.onModuleInit().
     */
    protected channels(): string[] {
        return ReelEventRegistry.getChannels();
    }

    /**
     * Instantiate handler constructors and build instance map.
     * Called after BaseSubscriber.onModuleInit() sets up the connection.
     *
     * Override: BaseSubscriber.onModuleInit() calls channels() before
     * subscribing, so we hook into it here to also build the instance map.
     */
    async onModuleInit(): Promise<void> {
        // Instantiate every registered handler with injected deps
        for (const [key, HandlerClass] of ReelEventRegistry.getHandlers()) {
            const instance = new HandlerClass(this.redisService, this.db);
            this.instances.set(key, instance);
        }

        // Delegate connection + subscription to BaseSubscriber
        await super.onModuleInit();
    }

    /**
     * Route an AppMessage envelope to the correct handler.
     * Key format: `{channel}:{message.type}` - matches registry key format.
     * Unhandled keys are silently ignored (other modules share channels).
     *
     * @param channel Redis channel the message arrived on.
     * @param message Parsed and validated AppMessage envelope.
     */
    protected async route(
        channel: string,
        message: AppMessage<unknown>,
    ): Promise<void> {
        const key = `${channel}:${message.type}`;
        const handler = this.instances.get(key);

        if (!handler) {
            // Not an error - other modules publish to the same channels
            return;
        }

        await handler.handle(message);
    }
}
