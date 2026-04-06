import { Module } from "@nestjs/common";
import { MessagingService } from "./messaging.service";

/**
 * MessagingModule
 *
 * Owns all outbound async communication - BullMQ job dispatch and
 * Redis Pub/Sub event publishing.
 *
 * Design decisions:
 *
 * 1. No BullModule.registerQueue() here.
 *    Queues are registered once in the global QueuesModule and exported
 *    from there. MessagingService resolves them at runtime via ModuleRef,
 *    so this module stays lean regardless of how many queues exist.
 *
 * 2. No @Global() decorator.
 *    Import MessagingModule explicitly in each feature module that needs
 *    it. Explicit imports make dependency graphs readable and prevent
 *    hidden coupling via ambient globals.
 *
 * 3. RedisService must be available in the DI container.
 *    If RedisModule is @Global(), nothing extra is needed. Otherwise,
 *    add RedisModule to the imports array here.
 *
 * Usage - in any feature module:
 *
 *   @Module({
 *     imports: [MessagingModule],
 *     providers: [ReelsFeedService],
 *   })
 *   export class ReelsModule {}
 *
 * Usage - in any feature service:
 *
 *   constructor(private readonly messagingService: MessagingService) {}
 *
 *   void this.messagingService.dispatchJob(REELS_QUEUE_JOBS.FEED_COLD_START, { userId });
 *   void this.messagingService.dispatchEvent(FEED_EVENTS.FEED_LOW, { userId, remaining });
 */
@Module({
    providers: [MessagingService],
    exports: [MessagingService],
})
export class MessagingModule {}
