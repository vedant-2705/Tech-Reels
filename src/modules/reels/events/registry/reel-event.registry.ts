/**
 * @module modules/reels/events/registry/reel-event.registry
 * @description
 * Self-registering dispatch registry for Reels pub/sub event handlers.
 * Mirrors BadgeCriteriaRegistry from the Gamification module.
 *
 * Adding a new handler:
 *   1. Create a class implementing IReelEventHandler.
 *   2. At the bottom of that file call ReelEventRegistry.register().
 *   3. Import the handler file in reel-interactions.subscriber.ts.
 *   No other changes required - subscriber instantiates automatically.
 */

import { Logger } from '@nestjs/common';
import { ReelEventHandlerConstructor } from '../handlers/ireel-event-handler.interface';

const logger = new Logger('ReelEventRegistry');

/** Composite dispatch key: {channel}:{event} */
export type ReelEventKey = string;

/**
 * Static registry mapping composite dispatch keys to handler constructors.
 * Populated at module load time via self-registering handler files.
 */
export class ReelEventRegistry {
    private static readonly registry = new Map<
        ReelEventKey,
        ReelEventHandlerConstructor
    >();

    /**
     * Register a handler constructor for a channel + event combination.
     * Called by each handler file at module scope (self-registration).
     *
     * @param channel Redis pub/sub channel name.
     * @param event Event name string (e.g. 'REEL_WATCH_ENDED').
     * @param ctor Handler class constructor.
     */
    static register(
        channel: string,
        event: string,
        ctor: ReelEventHandlerConstructor,
    ): void {
        const key: ReelEventKey = `${channel}:${event}`;
        ReelEventRegistry.registry.set(key, ctor);
        logger.debug(`Registered handler constructor for key "${key}"`);
    }

    /**
     * Returns all registered handler constructors with their keys.
     * Used by subscriber to instantiate handlers with injected deps.
     *
     * @returns Map of composite key -> constructor.
     */
    static getHandlers(): Map<ReelEventKey, ReelEventHandlerConstructor> {
        return ReelEventRegistry.registry;
    }

    /**
     * Returns all unique channel names that have registered handlers.
     * Used by subscriber to know which channels to subscribe to.
     *
     * @returns Array of unique channel name strings.
     */
    static getChannels(): string[] {
        const channels = new Set<string>();
        for (const key of ReelEventRegistry.registry.keys()) {
            // key format: {channel}:{EVENT_NAME}
            // channel itself may contain no colons - split on last colon
            const lastColon = key.lastIndexOf(':');
            channels.add(key.substring(0, lastColon));
        }
        return Array.from(channels);
    }

    /**
     * Returns true if a handler is registered for the given channel + event.
     *
     * @param channel Redis pub/sub channel name.
     * @param event Event name string.
     * @returns true if registered.
     */
    static has(channel: string, event: string): boolean {
        return ReelEventRegistry.registry.has(`${channel}:${event}`);
    }
}