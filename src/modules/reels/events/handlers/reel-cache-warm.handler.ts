import { Logger } from "@nestjs/common";
import { DatabaseService } from "@database/database.service";
import { RedisService } from "@redis/redis.service";

import { IReelEventHandler } from "./ireel-event-handler.interface";
import { ReelEventRegistry } from "../registry/reel-event.registry";
import { AppMessage } from "@modules/messaging";
import { FEED_MANIFEST } from "@modules/feed/feed.messaging";
import { FeedBuiltEventPayload } from "@modules/feed";
import { ReelsRepository } from "../../reels.repository";
import { REELS_MODULE_CONSTANTS } from "../../reels.constants";

export class ReelCacheWarmHandler implements IReelEventHandler {
    readonly channel = REELS_MODULE_CONSTANTS.FEED_EVENTS;
    readonly event = FEED_MANIFEST.events.FEED_BUILT.eventType;

    private readonly logger = new Logger(ReelCacheWarmHandler.name);
    private readonly reelsRepository: ReelsRepository;

    constructor(redis: RedisService, db: DatabaseService) {
        this.reelsRepository = new ReelsRepository(db, redis);
    }

    async handle(message: AppMessage<unknown>): Promise<void> {
        const { reelIds } = message.payload as FeedBuiltEventPayload;

        if (!reelIds?.length) return;

        try {
            await this.reelsRepository.setReelsToCache(reelIds);
            this.logger.debug(
                `Warmed reel:meta cache for ${reelIds.length} reels`,
            );
        } catch (err) {
            this.logger.warn(`Cache warm failed: ${(err as Error).message}`);
        }
    }
}

ReelEventRegistry.register(
    REELS_MODULE_CONSTANTS.FEED_EVENTS,
    FEED_MANIFEST.events.FEED_BUILT.eventType,
    ReelCacheWarmHandler,
);
