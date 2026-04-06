/**
 * @module modules/reels/services/reels-admin.service
 * @description
 * Handles admin-only reel operations:
 *   adminUpdateStatus - change reel status + manage Redis tag sets
 *   adminGetReels     - list all reels with filters (cursor-paginated)
 */

import { Injectable, Logger } from "@nestjs/common";

import { ReelsRepository } from "../reels.repository";
import { RedisService } from "@redis/redis.service";

import { AdminUpdateStatusDto } from "../dto/admin-update-status.dto";
import { AdminGetReelsDto } from "../dto/admin-get-reels.dto";

import { AdminStatusUpdateResponseDto } from "../dto/admin-status-update-response.dto";
import { AdminReelsPaginatedResponseDto } from "../dto/admin-reels-paginated-response.dto";

import { ReelNotFoundException } from "../exceptions/reel-not-found.exception";
import { toReelResponseDto } from "../reels.mapper";

import { REEL_STATUS } from "../reels.constants";
import {
    TAGS_ALL_KEY,
    TAGS_CATEGORY_PREFIX,
} from "@common/constants/redis-keys.constants";
import { MessagingService, REELS } from "@modules/messaging";

@Injectable()
export class ReelsAdminService {
    private readonly logger = new Logger(ReelsAdminService.name);

    constructor(
        private readonly reelsRepository: ReelsRepository,
        private readonly redis: RedisService,
        private readonly messagingService: MessagingService,
    ) {}

    /**
     * Admin: update reel status. Manages tag set membership in Redis
     * and invalidates reel meta cache.
     *
     * active   -> SADD reel to each tag's Redis Set.
     * disabled -> SREM reel from each tag's Redis Set.
     * needs_review -> no tag set change.
     */
    async adminUpdateStatus(
        reelId: string,
        dto: AdminUpdateStatusDto,
    ): Promise<AdminStatusUpdateResponseDto> {
        const reel = await this.reelsRepository.findById(reelId);
        if (!reel) throw new ReelNotFoundException();

        const updated = await this.reelsRepository.updateStatus(
            reelId,
            dto.status,
        );

        await this.reelsRepository.deleteMetaCache(reelId);

        if (dto.status === REEL_STATUS.ACTIVE) {
            await this.reelsRepository.bulkAddToTagSets(
                reel.tags.map((t) => t.id),
                reelId,
            );
            await this.invalidateTagsCache();
        } else if (dto.status === REEL_STATUS.DISABLED) {
            await this.reelsRepository.bulkRemoveFromTagSets(
                reel.tags.map((t) => t.id),
                reelId,
            );
            await this.invalidateTagsCache();
        }

        void this.messagingService.dispatchEvent(
            REELS.EVENTS.REEL_STATUS_CHANGED,
            {
                reelId,
                status: dto.status,
            },
        );

        return {
            id: updated.id,
            status: updated.status,
            updated_at: updated.updated_at,
        };
    }

    /** Admin: return all reels with optional filters (cursor-paginated). */
    async adminGetReels(
        query: AdminGetReelsDto,
    ): Promise<AdminReelsPaginatedResponseDto> {
        const limit = query.limit ?? 20;

        const rows = await this.reelsRepository.findAllAdmin(
            limit,
            query.cursor,
            query.status,
            query.creator_id,
        );

        const hasMore = rows.length > limit;
        const data = rows.slice(0, limit);

        return {
            data: data.map((r) => toReelResponseDto(r)),
            meta: {
                next_cursor: hasMore ? data[data.length - 1].id : null,
                has_more: hasMore,
            },
        };
    }

    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------

    private async invalidateTagsCache(): Promise<void> {
        try {
            await this.redis.del(TAGS_ALL_KEY);
            await this.redis.deletePattern(`${TAGS_CATEGORY_PREFIX}:*`);
        } catch (err) {
            this.logger.warn(
                `Tags cache invalidation failed: ${(err as Error).message}`,
            );
        }
    }
}
