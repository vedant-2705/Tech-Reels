/**
 * @module modules/reels/reels-processing.service
 * @description
 * Thin service wrapping the two repository methods that the Media module
 * needs to call after MediaConvert processing completes.
 *
 * Exported from ReelsModule so Media module can import ReelsModule and
 * inject ReelsProcessingService - same pattern as AuthSessionService.
 *
 * The Media module MUST NOT inject ReelsRepository directly.
 */

import { Injectable } from "@nestjs/common";
import { ReelsRepository, ProcessingResultData } from "./reels.repository";
import { ReelTag } from "./entities/reel.entity";

/**
 * Service exposing processing-pipeline integration points for the Media module.
 */
@Injectable()
export class ReelsProcessingService {
    /**
     * @param reelsRepository Reels data-access layer.
     */
    constructor(private readonly reelsRepository: ReelsRepository) {}

    /**
     * Persist the result of a MediaConvert processing job (complete or failed).
     * Called by Media module's webhook handler after EventBridge fires.
     *
     * @param reelId Reel UUID being updated.
     * @param data Processing result including new status, hls_path, thumbnail_key, duration.
     * @returns void
     */
    async setProcessingResult(
        reelId: string,
        data: ProcessingResultData,
    ): Promise<void> {
        return this.reelsRepository.setProcessingResult(reelId, data);
    }

    /**
     * Retrieve all tags associated with a reel from the database.
     * Used by the Media module after processing completes to populate
     * tag sets in Redis (SADD reel_tags:tag:{tagId}).
     *
     * @param reelId Reel UUID.
     * @returns Array of tag objects (id, name, category).
     */
    async getTagsForReel(reelId: string): Promise<ReelTag[]> {
        return this.reelsRepository.getTagsForReel(reelId);
    }
}
