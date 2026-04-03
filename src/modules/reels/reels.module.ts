/**
 * @module modules/reels/reels.module
 * @description
 * NestJS module wiring together all Reels providers, queues, and exports.
 *
 * Imports:
 *   TagsModule       - for tag validation (validateTagIds)
 *   BullModule (x2)  - VIDEO_PROCESSING and FEED_BUILD queues
 *
 * Exports:
 *   ReelsProcessingService - thin wrapper used by Media module to call
 *   setProcessingResult and getTagsForReel after MediaConvert completes.
 *   Pattern: same as AuthSessionService exported from AuthModule.
 *
 * NOTE: ReelsRepository is NOT exported directly. Media module MUST
 * import ReelsModule and inject ReelsProcessingService only.
 */

import { Module } from "@nestjs/common";

import { ReelsController } from "./reels.controller";
import { ReelsService } from "./reels.service.abstract";
import { ReelsServiceImpl } from "./reels.service";
import { ReelsRepository } from "./reels.repository";
import { ReelsProcessingService } from "./reels-processing.service";

import { TagsModule } from "@modules/tags/tags.module";
import { ViewCountSyncService } from "./services/view-count-sync.service";
import { ReelInteractionsSubscriber } from "./subscribers/reel-interaction.subscriber";

/**
 * Registers Reels runtime dependencies, queue bindings, and exported services.
 */
@Module({
    imports: [
        TagsModule,
    ],
    controllers: [ReelsController],
    providers: [
        { provide: ReelsService, useClass: ReelsServiceImpl },
        ReelsRepository,
        ReelsProcessingService,
        ReelInteractionsSubscriber,
        ViewCountSyncService,
    ],
    exports: [
        /**
         * Exported for Media module integration.
         * Media module imports ReelsModule and injects ReelsProcessingService
         * to call setProcessingResult and getTagsForReel after processing.
         */
        ReelsProcessingService,
    ],
})
export class ReelsModule {}
