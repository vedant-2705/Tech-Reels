/**
 * @module modules/feed/events/registry/feed-event.registry
 * @description
 * Self-registering dispatch registry for Feed pub/sub affinity event handlers.
 * Mirrors ReelEventRegistry from the Reels module exactly.
 *
 * Adding a new handler:
 *   1. Create a class implementing IFeedEventHandler.
 *   2. Call FeedEventRegistry.register() at the bottom of that file.
 *   3. Import the handler file in feed-interactions.subscriber.ts.
 *   No other changes required - subscriber instantiates automatically.
 */

import { Logger } from "@nestjs/common";
import { FeedEventHandlerConstructor } from "../handlers/ifeed-event-handler.interface";

const logger = new Logger("FeedEventRegistry");

/** Composite dispatch key: {channel}:{event} */
export type FeedEventKey = string;

/**
 * Static registry mapping composite dispatch keys to handler constructors.
 * Populated at module load time via self-registering handler files.
 */
export class FeedEventRegistry {
    private static readonly registry = new Map<
        FeedEventKey,
        FeedEventHandlerConstructor
    >();

    /**
     * Register a handler constructor for a channel + event combination.
     * Called by each handler file at module scope (self-registration).
     *
     * @param channel Redis pub/sub channel name.
     * @param event Event name string (e.g. 'REEL_WATCH_ENDED').
     * @param ctor Handler class constructor.
     * @returns void
     */
    static register(
        channel: string,
        event: string,
        ctor: FeedEventHandlerConstructor,
    ): void {
        const key: FeedEventKey = `${channel}:${event}`;
        FeedEventRegistry.registry.set(key, ctor);
        logger.debug(`Registered handler constructor for key "${key}"`);
    }

    /**
     * Returns all registered handler constructors with their keys.
     * Used by FeedInteractionsSubscriber to instantiate handlers with
     * injected deps at module init time.
     *
     * @returns Map of composite key to constructor.
     */
    static getHandlers(): Map<FeedEventKey, FeedEventHandlerConstructor> {
        return FeedEventRegistry.registry;
    }

    /**
     * Returns all unique channel names that have registered handlers.
     * Used by FeedInteractionsSubscriber to know which channels to subscribe to.
     * Note: feed_events channel is added by the subscriber directly (FEED_LOW
     * is handled inline, not via a registered handler).
     *
     * @returns Array of unique channel name strings.
     */
    static getChannels(): string[] {
        const channels = new Set<string>();
        for (const key of FeedEventRegistry.registry.keys()) {
            // key format: {channel}:{EVENT_NAME}
            // split on last colon to handle channel names without colons
            const lastColon = key.lastIndexOf(":");
            channels.add(key.substring(0, lastColon));
        }
        return Array.from(channels);
    }

    /**
     * Returns true if a handler is registered for the given channel + event.
     *
     * @param channel Redis pub/sub channel name.
     * @param event Event name string.
     * @returns true if a handler is registered.
     */
    static has(channel: string, event: string): boolean {
        return FeedEventRegistry.registry.has(`${channel}:${event}`);
    }
}
