/**
 * @module modules/reels/services/reels-interaction.service
 * @description
 * Handles all user-to-reel interactions: like, unlike, save, unsave,
 * watch telemetry, and report.
 *
 * Each interaction validates the reel exists, mutates state (DB + Redis cache),
 * and publishes the corresponding Pub/Sub event.
 */

import { Injectable } from "@nestjs/common";

import { ReelsRepository } from "../reels.repository";
import { RedisService } from "@redis/redis.service";

import { WatchReelDto } from "../dto/watch-reel.dto";
import { ReportReelDto } from "../dto/report-reel.dto";
import { MessageResponseDto } from "@common/dto/message-response.dto";

import { ReelNotFoundException } from "../exceptions/reel-not-found.exception";

import {
    REEL_META_FIELD,
    REEL_STATUS,
    REELS_MESSAGES,
    REELS_MODULE_CONSTANTS,
} from "../reels.constants";

@Injectable()
export class ReelsInteractionService {
    constructor(
        private readonly reelsRepository: ReelsRepository,
        private readonly redis: RedisService,
    ) {}

    /** Like a reel. Returns the current liked state. */
    async likeReel(
        userId: string,
        reelId: string,
    ): Promise<{ liked: boolean }> {
        const reel = await this.reelsRepository.findById(reelId);
        if (!reel || reel.status !== REEL_STATUS.ACTIVE)
            throw new ReelNotFoundException();

        const inserted = await this.reelsRepository.like(userId, reelId);
        if (inserted) {
            await this.reelsRepository.incrMetaCount(
                reelId,
                REEL_META_FIELD.LIKE_COUNT,
                1,
            );
        }

        void this.redis.publish(
            REELS_MODULE_CONSTANTS.USER_INTERACTIONS,
            JSON.stringify({
                event: REELS_MODULE_CONSTANTS.REEL_LIKED,
                userId,
                reelId,
                tags: reel.tags.map((t) => t.id),
            }),
        );

        return { liked: true };
    }

    /** Unlike a reel. Returns the current liked state. */
    async unlikeReel(
        userId: string,
        reelId: string,
    ): Promise<{ liked: boolean }> {
        const reel = await this.reelsRepository.findById(reelId);
        if (!reel || reel.status !== REEL_STATUS.ACTIVE)
            throw new ReelNotFoundException();

        const deleted = await this.reelsRepository.unlike(userId, reelId);
        if (deleted) {
            await this.reelsRepository.incrMetaCount(
                reelId,
                REEL_META_FIELD.LIKE_COUNT,
                -1,
            );
        }

        void this.redis.publish(
            REELS_MODULE_CONSTANTS.USER_INTERACTIONS,
            JSON.stringify({
                event: REELS_MODULE_CONSTANTS.REEL_UNLIKED,
                userId,
                reelId,
            }),
        );

        return { liked: false };
    }

    /** Save a reel to the user's collection. */
    async saveReel(
        userId: string,
        reelId: string,
    ): Promise<{ saved: boolean }> {
        const reel = await this.reelsRepository.findById(reelId);
        if (!reel) throw new ReelNotFoundException();

        const inserted = await this.reelsRepository.save(userId, reelId);
        if (inserted) {
            await this.reelsRepository.incrMetaCount(
                reelId,
                REEL_META_FIELD.SAVE_COUNT,
                1,
            );
        }

        void this.redis.publish(
            REELS_MODULE_CONSTANTS.USER_INTERACTIONS,
            JSON.stringify({
                event: REELS_MODULE_CONSTANTS.REEL_SAVED,
                userId,
                reelId,
            }),
        );

        return { saved: true };
    }

    /** Remove a reel from the user's saved collection. */
    async unsaveReel(
        userId: string,
        reelId: string,
    ): Promise<{ saved: boolean }> {
        const reel = await this.reelsRepository.findById(reelId);
        if (!reel) throw new ReelNotFoundException();

        const deleted = await this.reelsRepository.unsave(userId, reelId);
        if (deleted) {
            await this.reelsRepository.incrMetaCount(
                reelId,
                REEL_META_FIELD.SAVE_COUNT,
                -1,
            );
        }

        void this.redis.publish(
            REELS_MODULE_CONSTANTS.USER_INTERACTIONS,
            JSON.stringify({
                event: REELS_MODULE_CONSTANTS.REEL_UNSAVED,
                userId,
                reelId,
            }),
        );

        return { saved: false };
    }

    /** Record a watch event and publish telemetry. */
    async watchReel(
        userId: string,
        reelId: string,
        role: string,
        dto: WatchReelDto,
    ): Promise<void> {
        const reel = await this.reelsRepository.findById(reelId);
        if (!reel) throw new ReelNotFoundException();

        if (reel.creator_id === userId || role === "admin") {
            return;
        }

        void this.redis.publish(
            REELS_MODULE_CONSTANTS.VIDEO_TELEMETRY,
            JSON.stringify({
                event: REELS_MODULE_CONSTANTS.REEL_WATCH_ENDED,
                userId,
                reelId,
                watch_duration_secs: dto.watch_duration_secs,
                completion_pct: dto.completion_pct,
                timestamp: new Date().toISOString(),
            }),
        );
    }

    /** Report a reel for moderation. */
    async reportReel(
        userId: string,
        reelId: string,
        dto: ReportReelDto,
    ): Promise<MessageResponseDto> {
        const reel = await this.reelsRepository.findById(reelId);
        if (!reel) throw new ReelNotFoundException();

        await this.reelsRepository.insertReport(
            userId,
            reelId,
            dto.reason,
            dto.details,
        );

        return { message: REELS_MESSAGES.REPORT_SUBMITTED };
    }
}
