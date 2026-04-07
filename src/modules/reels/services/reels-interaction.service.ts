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

import { WatchReelDto } from "../dto/watch-reel.dto";
import { ReportReelDto } from "../dto/report-reel.dto";
import { MessageResponseDto } from "@common/dto/message-response.dto";

import { ReelNotFoundException } from "../exceptions/reel-not-found.exception";

import {
    REEL_META_FIELD,
    REEL_STATUS,
    REELS_MESSAGES,
} from "../reels.constants";
import { MessagingService } from "@modules/messaging";
import { REELS_MANIFEST } from "../reels.messaging";
import { ReelLikedEventPayload, ReelSavedEventPayload, ReelUnlikedEventPayload, ReelUnsavedEventPayload, ReelWatchEndedEventPayload } from "../reels.interface";

@Injectable()
export class ReelsInteractionService {
    constructor(
        private readonly reelsRepository: ReelsRepository,
        private readonly messagingService: MessagingService,
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

        const payload: ReelLikedEventPayload = {
            userId,
            reelId,
            tags: reel.tags.map((t) => t.id),
        }
        void this.messagingService.dispatchEvent(
            REELS_MANIFEST.events.REEL_LIKED.eventType,
            payload,
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

        const payload: ReelUnlikedEventPayload = {
            userId,
            reelId,
        }
        void this.messagingService.dispatchEvent(
            REELS_MANIFEST.events.REEL_UNLIKED.eventType,
            payload,
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

        const payload: ReelSavedEventPayload = {
            userId,
            reelId,
        }
        void this.messagingService.dispatchEvent(
            REELS_MANIFEST.events.REEL_SAVED.eventType,
            payload,
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

        const payload: ReelUnsavedEventPayload = {
            userId,
            reelId,
        }
        void this.messagingService.dispatchEvent(
            REELS_MANIFEST.events.REEL_UNSAVED.eventType,
            payload,
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

        const payload: ReelWatchEndedEventPayload = {
            userId,
            reelId,
            watch_duration_secs: dto.watch_duration_secs,
            completion_pct: dto.completion_pct,
        }
        void this.messagingService.dispatchEvent(
            REELS_MANIFEST.events.REEL_WATCH_ENDED.eventType,
            payload,
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
