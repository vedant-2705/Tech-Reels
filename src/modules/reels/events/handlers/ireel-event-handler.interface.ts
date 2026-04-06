/**
 * @module modules/reels/events/handlers/ireel-event-handler.interface
 * @description
 * Interface that every Reels pub/sub event handler must implement.
 * Mirrors ICriteria pattern from the Gamification module.
 */

import { DatabaseService } from "@database/database.service";
import { AppMessage } from "@modules/messaging";
import { RedisService } from "@redis/redis.service";

/**
 * Every Reels event handler must implement this interface.
 * channel + event together form the dispatch key.
 */
export interface IReelEventHandler {
    /** Redis pub/sub channel this handler listens on. */
    readonly channel: string;

    /** Event name this handler responds to. */
    readonly event: string;

    /**
     * Handle the incoming pub/sub event.
     *
     * @param message AppMessage envelope.
     * @returns void
     */
    handle(message: AppMessage<unknown>): Promise<void>;
}

/**
 * Constructor signature for handler classes.
 * Registry stores these - subscriber instantiates with injected deps.
 */
export type ReelEventHandlerConstructor = new (
    redis: RedisService,
    db: DatabaseService,
) => IReelEventHandler;
