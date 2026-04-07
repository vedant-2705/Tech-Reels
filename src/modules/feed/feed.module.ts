/**
 * @module modules/feed/feed.module
 * @description
 * Feed module - owns the recommendation pipeline, affinity updates,
 * trending computation, and feed list writes.
 *
 * Does NOT own: reel metadata (queries DB directly via FeedRepository),
 * feed:{userId} Redis List reads (owned by Reels module).
 *
 * All queues are registered globally via QueuesModule - never re-registered here.
 * DatabaseModule, RedisModule are global - no explicit import needed.
 * ScheduleModule.forRoot() is registered in AppModule - not imported here.
 */

import { Module } from "@nestjs/common";

import { ReelsModule } from "@modules/reels/reels.module";

import { FeedRepository } from "./feed.repository";
import { FeedInteractionsSubscriber } from "./subscribers/feed-interactions.subscriber";
import { AffinityUpdateWorker } from "./workers/affinity-update.worker";
import { FeedBuildWorker } from "./workers/feed-build.worker";
import { CandidateGeneratorService } from "./services/candidate-generator.service";
import { ReelScorerService } from "./services/reel-scorer.service";
import { FeedBuilderService } from "./services/feed-builder.service";
import { TrendingReelsCron } from "./crons/trending-reels.cron";
import { AffinityDecayCron } from "./crons/affinity-decay.cron";
import { MessagingModule } from "@modules/messaging";

@Module({
    imports: [
        ReelsModule,
        MessagingModule,
    ],
    providers: [
        FeedRepository,
        FeedInteractionsSubscriber,
        AffinityUpdateWorker,
        FeedBuildWorker,
        CandidateGeneratorService,
        ReelScorerService,
        FeedBuilderService,
        TrendingReelsCron,
        AffinityDecayCron,
    ],
    exports: [FeedBuilderService],
})
export class FeedModule {}
