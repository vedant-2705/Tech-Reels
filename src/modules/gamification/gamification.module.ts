/**
 * @module modules/gamification/gamification.module
 * @description
 * NestJS module for the Gamification feature.
 *
 * This module has NO controller and NO HTTP endpoints.
 * It is entirely event-driven: workers consume BullMQ queues,
 * the subscriber listens to Redis Pub/Sub channels.
 *
 * Wiring decisions:
 *
 *   Queues: NOT registered here. QueuesModule is @Global() and already
 *   registers all queues. Workers use @InjectQueue() from that global
 *   registration. Registering queues here again would cause conflicts.
 *
 *   DatabaseModule + RedisModule: imported locally so NestJS DI can
 *   resolve DatabaseService and RedisService for the repository.
 *
 *   Workers registered as providers: NestJS + @nestjs/bullmq requires
 *   worker classes to be listed as providers in the module that declares
 *   them. The @Processor() decorator handles queue binding - no extra
 *   BullModule.registerQueue() needed here.
 *
 *   GamificationRepository exported: not exported intentionally.
 *   This module has no cross-module consumers. If a future module needs
 *   gamification data, expose a thin GamificationService method instead
 *   (per Foundation doc Section 8).
 */

import { Module } from "@nestjs/common";
import { DatabaseModule } from "@database/database.module";
import { RedisModule } from "@redis/redis.module";

import { GamificationRepository } from "./gamification.repository";
import { GamificationService } from "./gamification.service.abstract";
import { GamificationServiceImpl } from "./gamification.service";

import { XpAwardWorker } from "./workers/xp-award.worker";
import { BadgeEvaluationWorker } from "./workers/badge-evaluation.worker";
import { StreakResetWorker } from "./workers/streak-reset.worker";
import { LeaderboardResetWorker } from "./workers/leaderboard-reset.worker";

import { GamificationSubscriber } from "./subscribers/gamification.subscriber";
import { MessagingModule } from "@modules/messaging";
import { GamificationFacade } from "./gamification.facade";

@Module({
    imports: [DatabaseModule, RedisModule, MessagingModule],
    providers: [
        // Core
        GamificationRepository,
        { provide: GamificationService, useClass: GamificationServiceImpl },

        // BullMQ workers - @Processor() binds each to its queue.
        // QueuesModule (@Global) makes @InjectQueue() resolvable here
        // without re-importing BullModule.
        XpAwardWorker,
        BadgeEvaluationWorker,
        StreakResetWorker,
        LeaderboardResetWorker,

        // Redis Pub/Sub subscriber
        GamificationSubscriber,
    ],
    // Nothing exported - this module is self-contained.
    // Cross-module access goes through thin service methods per Foundation §8.
    exports: [GamificationFacade],
})
export class GamificationModule {}
