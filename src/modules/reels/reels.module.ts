/**
 * @module modules/reels/reels.module
 * @description
 * NestJS module wiring together all Reels providers, queues, and exports.
 *
 * Imports:
 *   TagsModule       - for tag validation (validateTagIds)
 *
 * Providers:
 *   ReelsServiceImpl (facade) ← delegates to 6 focused sub-services.
 *   ReelsUploadService, ReelsInteractionService, ReelsFeedService,
 *   ReelsManagementService, ReelsSearchService, ReelsAdminService.
 *
 * Exports:
 *   ReelsProcessingService - thin wrapper used by Media module to call
 *   setProcessingResult and getTagsForReel after MediaConvert completes.
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

import { ReelsUploadService } from "./services/reels-upload.service";
import { ReelsInteractionService } from "./services/reels-interaction.service";
import { ReelsFeedService } from "./services/reels-feed.service";
import { ReelsManagementService } from "./services/reels-management.service";
import { ReelsSearchService } from "./services/reels-search.service";
import { ReelsAdminService } from "./services/reels-admin.service";

import { TagsModule } from "@modules/tags/tags.module";
import { ViewCountSyncService } from "./services/view-count-sync.service";
import { ReelInteractionsSubscriber } from "./subscribers/reel-interaction.subscriber";
import { MessagingModule } from "@modules/messaging";
import { FeedModule } from "@modules/feed";

/**
 * Registers Reels runtime dependencies, queue bindings, and exported services.
 */
@Module({
    imports: [
        TagsModule,
        MessagingModule,
        FeedModule,
    ],
    controllers: [ReelsController],
    providers: [
        // Facade - the only provider the controller depends on
        { provide: ReelsService, useClass: ReelsServiceImpl },

        // Sub-services - injected by the facade
        ReelsUploadService,
        ReelsInteractionService,
        ReelsFeedService,
        ReelsManagementService,
        ReelsSearchService,
        ReelsAdminService,

        // Data access
        ReelsRepository,

        // Background / infra
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
