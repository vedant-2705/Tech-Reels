/**
 * @module modules/reels/services/reels-management.service
 * @description
 * Handles CRUD management and list operations for reels:
 *   getMyReels       - creator's own reels (all statuses)
 *   getReelById      - single reel (cache-first, active only)
 *   updateReel       - update metadata + tag replacement
 *   deleteReel       - soft-delete + cache/tag-set eviction
 *   getReelsByCreator - public profile reels (active only)
 *   getLikedReels     - user's liked reels (cursor-paginated)
 *   getSavedReels     - user's saved reels (cursor-paginated)
 */

import { ForbiddenException, Injectable, Logger } from "@nestjs/common";

import { ReelsRepository } from "../reels.repository";
import { RedisService } from "@redis/redis.service";

import { UpdateReelDto } from "../dto/update-reel.dto";
import { MyReelsQueryDto } from "../dto/my-reels-query.dto";
import { InteractedReelsQueryDto } from "../dto/interacted-reels-query.dto";

import { ReelResponseDto } from "../dto/reel-response.dto";
import { MyReelsPaginatedResponseDto } from "../dto/my-reels-paginated-response.dto";
import { LikedReelsPaginatedResponseDto } from "../dto/liked-reels-paginated-response.dto";
import { SavedReelsPaginatedResponseDto } from "../dto/saved-reels-paginated-response.dto";
import { InteractedReelItemDto } from "../dto/interacted-reel-item.dto";
import { MessageResponseDto } from "@common/dto/message-response.dto";

import { ReelNotFoundException } from "../exceptions/reel-not-found.exception";
import { InvalidReelTagsException } from "../exceptions/invalid-reel-tags.exception";

import { toReelResponseDto, metaToResponseDto } from "../reels.mapper";
import {
    decodeInteractionCursor,
    encodeInteractionCursor,
} from "../utils/interaction-cursor.util";

import {
    REEL_EDITABLE_STATUSES,
    REEL_STATUS,
    REELS_MESSAGES,
} from "../reels.constants";
import { TAGS_ALL_KEY, TAGS_CATEGORY_PREFIX } from "@common/constants/redis-keys.constants";
import { MessagingService } from "@modules/messaging";
import { REELS_MANIFEST } from "../reels.messaging";
import { ReelDeletedEventPayload } from "../reels.interface";

@Injectable()
export class ReelsManagementService {
    private readonly logger = new Logger(ReelsManagementService.name);

    constructor(
        private readonly reelsRepository: ReelsRepository,
        private readonly redis: RedisService,
        private readonly messagingService: MessagingService,
    ) {}

    /** Return the authenticated user's own reels (cursor-paginated). */
    async getMyReels(
        userId: string,
        query: MyReelsQueryDto,
    ): Promise<MyReelsPaginatedResponseDto> {
        const limit = query.limit ?? 20;

        const rows = await this.reelsRepository.findByCreator(
            userId,
            limit,
            query.cursor,
            query.status,
        );

        const hasMore = rows.length > limit;
        const data = rows.slice(0, limit);

        return {
            data: data.map((r) => toReelResponseDto(r)),
            meta: {
                next_cursor: hasMore ? data[data.length - 1].id : null,
                has_more: hasMore,
                total: data.length,
            },
        };
    }

    /** Return a single active reel by ID (cache-first). */
    async getReelById(reelId: string): Promise<ReelResponseDto> {
        const cached = await this.reelsRepository.getMetaFromCache(reelId);
        if (cached) {
            if (cached.status !== REEL_STATUS.ACTIVE)
                throw new ReelNotFoundException();
            return metaToResponseDto(cached);
        }

        const reel = await this.reelsRepository.findById(reelId);
        if (!reel || reel.status !== REEL_STATUS.ACTIVE)
            throw new ReelNotFoundException();

        await this.reelsRepository.setMetaCache(reelId, reel);

        return toReelResponseDto(reel);
    }

    /** Update mutable reel metadata. Tag replacement if tag_ids provided. */
    async updateReel(
        userId: string,
        reelId: string,
        dto: UpdateReelDto,
    ): Promise<ReelResponseDto> {
        const reel = await this.reelsRepository.findById(reelId);
        if (!reel) throw new ReelNotFoundException();
        if (reel.creator_id !== userId) throw new ForbiddenException();

        if (!REEL_EDITABLE_STATUSES.includes(reel.status as any)) {
            throw new ForbiddenException(
                `Reel with status '${reel.status}' cannot be edited`,
            );
        }

        let newTagIds: string[] | undefined;
        const oldTags = reel.tags;

        if (dto.tag_ids) {
            const validIds = await this.reelsRepository.validateTagIds(
                dto.tag_ids,
            );
            if (validIds.length !== dto.tag_ids.length) {
                throw new InvalidReelTagsException();
            }
            newTagIds = dto.tag_ids;
        }

        await this.reelsRepository.update(reelId, {
            title: dto.title,
            description: dto.description,
            difficulty: dto.difficulty,
        });

        if (newTagIds) {
            await this.reelsRepository.bulkRemoveFromTagSets(oldTags.map((t) => t.id), reelId);
            await this.reelsRepository.deleteReelTags(reelId);
            await this.reelsRepository.insertReelTags(reelId, newTagIds);

            if (reel.status === REEL_STATUS.ACTIVE) {
                await this.reelsRepository.bulkAddToTagSets(newTagIds, reelId);
            }

            await this.invalidateTagsCache();
        }

        await this.reelsRepository.deleteMetaCache(reelId);

        const fresh = await this.reelsRepository.findById(reelId);
        return toReelResponseDto(fresh!);
    }

    /** Soft-delete a reel. */
    async deleteReel(
        userId: string,
        reelId: string,
    ): Promise<MessageResponseDto> {
        const reel = await this.reelsRepository.findById(reelId);
        if (!reel) throw new ReelNotFoundException();
        if (reel.creator_id !== userId) throw new ForbiddenException();

        await this.reelsRepository.softDelete(reelId);
        await this.reelsRepository.deleteMetaCache(reelId);
        await this.reelsRepository.bulkRemoveFromTagSets(reel.tags.map((t) => t.id), reelId);
        await this.invalidateTagsCache();

        const payload: ReelDeletedEventPayload = {
            userId,
            reelId,
        }
        void this.messagingService.dispatchEvent(
            REELS_MANIFEST.events.REEL_DELETED.eventType,
            payload,
        );

        return { message: REELS_MESSAGES.DELETED };
    }

    /** Return active reels created by a given creator (cursor-paginated). */
    async getReelsByCreator(
        creatorId: string,
        query: MyReelsQueryDto,
    ): Promise<MyReelsPaginatedResponseDto> {
        const limit = query.limit ?? 20;

        const rows = await this.reelsRepository.findByCreator(
            creatorId,
            limit,
            query.cursor,
            REEL_STATUS.ACTIVE,
        );

        const hasMore = rows.length > limit;
        const data = rows.slice(0, limit);

        return {
            data: data.map((r) => toReelResponseDto(r)),
            meta: {
                next_cursor: hasMore ? data[data.length - 1].id : null,
                has_more: hasMore,
                total: data.length,
            },
        };
    }

    /** Return the user's liked reels (cursor-paginated). */
    async getLikedReels(
        userId: string,
        query: InteractedReelsQueryDto,
    ): Promise<LikedReelsPaginatedResponseDto> {
        const limit = query.limit ?? 20;
        const cursor = decodeInteractionCursor(query.cursor);

        const rows = await this.reelsRepository.findLikedByUser(
            userId,
            limit + 1,
            cursor,
        );

        const hasMore = rows.length > limit;
        const page = rows.slice(0, limit);

        const nextCursor =
            hasMore && page.length > 0
                ? encodeInteractionCursor(page[page.length - 1])
                : null;

        const pageIds = page.map((r) => r.id);
        const savedIds = await this.reelsRepository.bulkIsSaved(
            userId,
            pageIds,
        );
        const savedSet = new Set(savedIds);

        return {
            data: page.map(
                (r): InteractedReelItemDto => ({
                    ...toReelResponseDto(r),
                    is_liked: true,
                    is_saved: savedSet.has(r.id),
                }),
            ),
            meta: {
                next_cursor: nextCursor,
                has_more: hasMore,
            },
        };
    }

    /** Return the user's saved reels (cursor-paginated). */
    async getSavedReels(
        userId: string,
        query: InteractedReelsQueryDto,
    ): Promise<SavedReelsPaginatedResponseDto> {
        const limit = query.limit ?? 20;
        const cursor = decodeInteractionCursor(query.cursor);

        const rows = await this.reelsRepository.findSavedByUser(
            userId,
            limit + 1,
            cursor,
        );

        const hasMore = rows.length > limit;
        const page = rows.slice(0, limit);

        const nextCursor =
            hasMore && page.length > 0
                ? encodeInteractionCursor(page[page.length - 1])
                : null;

        const pageIds = page.map((r) => r.id);
        const likedIds = await this.reelsRepository.bulkIsLiked(
            userId,
            pageIds,
        );
        const likedSet = new Set(likedIds);

        return {
            data: page.map(
                (r): InteractedReelItemDto => ({
                    ...toReelResponseDto(r),
                    is_liked: likedSet.has(r.id),
                    is_saved: true,
                }),
            ),
            meta: {
                next_cursor: nextCursor,
                has_more: hasMore,
            },
        };
    }

    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------

    /**
     * Invalidate tags cache keys owned by the Tags module.
     * Called when reel becomes active or is deleted - reel_count changes.
     */
    private async invalidateTagsCache(): Promise<void> {
        try {
            await this.redis.del(TAGS_ALL_KEY);
            await this.redis.deletePattern(
                `${TAGS_CATEGORY_PREFIX}:*`,
            );
        } catch (err) {
            this.logger.warn(
                `Tags cache invalidation failed: ${(err as Error).message}`,
            );
        }
    }
}
