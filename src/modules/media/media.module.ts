/**
 * @module modules/media/media.module
 * @description
 * NestJS module that wires together the Media processing pipeline:
 * webhook controller, service, repository, and BullMQ worker.
 *
 * Imports:
 *   ReelsModule  - provides ReelsProcessingService (setProcessingResult,
 *                  getTagsForReel). Media injects this service; it MUST NOT
 *                  inject ReelsRepository directly.
 *   BullModule   - registers video_processing_queue so the worker can be
 *                  decorated with @Processor and picked up by BullMQ.
 *
 * No exports - this module owns internal infrastructure only. Nothing here
 * needs to be consumed by other modules.
 *
 * @see ReelsModule for the ReelsProcessingService export pattern.
 * @see VideoProcessingWorker for job processing logic.
 * @see MediaController for the POST /media/webhook endpoint.
 */

import { Module } from "@nestjs/common";

import { ReelsModule } from "@modules/reels/reels.module";

import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";
import { MediaRepository } from "./media.repository";
import { VideoProcessingWorker } from "./workers/video-processing.worker";

/**
 * Registers Media module providers, queue bindings, and cross-module imports.
 */
@Module({
    imports: [
        // Provides ReelsProcessingService - injected into MediaService
        // to call setProcessingResult() and getTagsForReel() after webhook.
        ReelsModule,
    ],
    controllers: [MediaController],
    providers: [MediaService, MediaRepository, VideoProcessingWorker],
})
export class MediaModule {}
