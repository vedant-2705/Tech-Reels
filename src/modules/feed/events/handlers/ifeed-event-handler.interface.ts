/**
 * @module modules/feed/events/handlers/ifeed-event-handler.interface
 * @description
 * Interface that every Feed pub/sub affinity event handler must implement.
 * Mirrors IReelEventHandler from the Reels module exactly, with the
 * constructor signature adjusted to accept a Queue instead of DatabaseService -
 * affinity handlers enqueue jobs rather than writing to DB directly.
 */

import { Queue } from "bullmq";
import { RedisService } from "@redis/redis.service";

/**
 * Parsed pub/sub payload - every event must carry an event field.
 */
export interface FeedEventPayload {
    event: string;
    [key: string]: unknown;
}

/**
 * Every Feed affinity event handler must implement this interface.
 * channel + event together form the dispatch key in FeedEventRegistry.
 */
export interface IFeedEventHandler {
    /** Redis pub/sub channel this handler listens on. */
    readonly channel: string;

    /** Event name this handler responds to. */
    readonly event: string;

    /**
     * Handle the incoming pub/sub event.
     *
     * @param payload Parsed event payload.
     * @returns void
     */
    handle(payload: FeedEventPayload): Promise<void>;
}

/**
 * Constructor signature for Feed handler classes.
 * Registry stores these constructors - subscriber instantiates them
 * with injected deps at module init time.
 *
 * Handlers receive RedisService (for any future Redis-side operations)
 * and the AFFINITY_UPDATE Queue (for enqueuing affinity jobs).
 */
export type FeedEventHandlerConstructor = new (
    redis: RedisService,
    affinityQueue: Queue,
) => IFeedEventHandler;
