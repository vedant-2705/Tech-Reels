/**
 * @module modules/reels/reels.service
 * @description
 * **Thin facade** - delegates all Reels use cases to focused sub-services.
 * This class implements the `ReelsService` abstract contract and is
 * registered in `ReelsModule` as `{ provide: ReelsService, useClass: ReelsServiceImpl }`.
 *
 * Sub-services:
 *   ReelsUploadService       - createReel, confirmReel
 *   ReelsInteractionService  - likeReel, unlikeReel, saveReel, unsaveReel, watchReel, reportReel
 *   ReelsFeedService         - getFeed (+ resolveReelMetas, buildPersonalisedFallback, annotate)
 *   ReelsManagementService   - getMyReels, getReelById, updateReel, deleteReel, getReelsByCreator, getLikedReels, getSavedReels
 *   ReelsSearchService       - searchReels, shareReel
 *   ReelsAdminService        - adminUpdateStatus, adminGetReels
 *
 * Zero business logic lives here - only delegation.
 */

import { Injectable } from "@nestjs/common";

import { ReelsService } from "./reels.service.abstract";

import { ReelsUploadService } from "./services/reels-upload.service";
import { ReelsInteractionService } from "./services/reels-interaction.service";
import { ReelsFeedService } from "./services/reels-feed.service";
import { ReelsManagementService } from "./services/reels-management.service";
import { ReelsSearchService } from "./services/reels-search.service";
import { ReelsAdminService } from "./services/reels-admin.service";

import { CreateReelDto } from "./dto/create-reel.dto";
import { ConfirmReelDto } from "./dto/confirm-reel.dto";
import { UpdateReelDto } from "./dto/update-reel.dto";
import { WatchReelDto } from "./dto/watch-reel.dto";
import { ReportReelDto } from "./dto/report-reel.dto";
import { AdminUpdateStatusDto } from "./dto/admin-update-status.dto";
import { MyReelsQueryDto } from "./dto/my-reels-query.dto";
import { FeedQueryDto } from "./dto/feed-query.dto";
import { AdminGetReelsDto } from "./dto/admin-get-reels.dto";
import { InteractedReelsQueryDto } from "./dto/interacted-reels-query.dto";
import { SearchReelsQueryDto } from "./dto/search-reels-query.dto";

import { CreateReelResponseDto } from "./dto/create-reel-response.dto";
import { ReelResponseDto } from "./dto/reel-response.dto";
import { FeedResponseDto } from "./dto/feed-response.dto";
import { MyReelsPaginatedResponseDto } from "./dto/my-reels-paginated-response.dto";
import { AdminReelsPaginatedResponseDto } from "./dto/admin-reels-paginated-response.dto";
import { AdminStatusUpdateResponseDto } from "./dto/admin-status-update-response.dto";
import { ShareReelResponseDto } from "./dto/share-reel-response.dto";
import { LikedReelsPaginatedResponseDto } from "./dto/liked-reels-paginated-response.dto";
import { SavedReelsPaginatedResponseDto } from "./dto/saved-reels-paginated-response.dto";
import { SearchReelsResponseDto } from "./dto/search-reels-response.dto";
import { MessageResponseDto } from "@common/dto/message-response.dto";

@Injectable()
export class ReelsServiceImpl extends ReelsService {
    constructor(
        private readonly uploadService: ReelsUploadService,
        private readonly interactionService: ReelsInteractionService,
        private readonly feedService: ReelsFeedService,
        private readonly managementService: ReelsManagementService,
        private readonly searchService: ReelsSearchService,
        private readonly adminService: ReelsAdminService,
    ) {
        super();
    }

    // -------------------------------------------------------------------------
    // Upload
    // -------------------------------------------------------------------------

    async createReel(
        userId: string,
        dto: CreateReelDto,
    ): Promise<CreateReelResponseDto> {
        return this.uploadService.createReel(userId, dto);
    }

    async confirmReel(
        userId: string,
        reelId: string,
        dto: ConfirmReelDto,
    ): Promise<{ reel_id: string; status: string; message: string }> {
        return this.uploadService.confirmReel(userId, reelId, dto);
    }

    // -------------------------------------------------------------------------
    // Interactions
    // -------------------------------------------------------------------------

    async likeReel(
        userId: string,
        reelId: string,
    ): Promise<{ liked: boolean }> {
        return this.interactionService.likeReel(userId, reelId);
    }

    async unlikeReel(
        userId: string,
        reelId: string,
    ): Promise<{ liked: boolean }> {
        return this.interactionService.unlikeReel(userId, reelId);
    }

    async saveReel(
        userId: string,
        reelId: string,
    ): Promise<{ saved: boolean }> {
        return this.interactionService.saveReel(userId, reelId);
    }

    async unsaveReel(
        userId: string,
        reelId: string,
    ): Promise<{ saved: boolean }> {
        return this.interactionService.unsaveReel(userId, reelId);
    }

    async watchReel(
        userId: string,
        reelId: string,
        role: string,
        dto: WatchReelDto,
    ): Promise<void> {
        return this.interactionService.watchReel(userId, reelId, role, dto);
    }

    async reportReel(
        userId: string,
        reelId: string,
        dto: ReportReelDto,
    ): Promise<MessageResponseDto> {
        return this.interactionService.reportReel(userId, reelId, dto);
    }

    // -------------------------------------------------------------------------
    // Feed
    // -------------------------------------------------------------------------

    async getFeed(
        userId: string,
        query: FeedQueryDto,
    ): Promise<FeedResponseDto> {
        return this.feedService.getFeed(userId, query);
    }

    // -------------------------------------------------------------------------
    // Management
    // -------------------------------------------------------------------------

    async getMyReels(
        userId: string,
        query: MyReelsQueryDto,
    ): Promise<MyReelsPaginatedResponseDto> {
        return this.managementService.getMyReels(userId, query);
    }

    async getReelById(reelId: string): Promise<ReelResponseDto> {
        return this.managementService.getReelById(reelId);
    }

    async updateReel(
        userId: string,
        reelId: string,
        dto: UpdateReelDto,
    ): Promise<ReelResponseDto> {
        return this.managementService.updateReel(userId, reelId, dto);
    }

    async deleteReel(
        userId: string,
        reelId: string,
    ): Promise<MessageResponseDto> {
        return this.managementService.deleteReel(userId, reelId);
    }

    async getReelsByCreator(
        creatorId: string,
        query: MyReelsQueryDto,
    ): Promise<MyReelsPaginatedResponseDto> {
        return this.managementService.getReelsByCreator(creatorId, query);
    }

    async getLikedReels(
        userId: string,
        query: InteractedReelsQueryDto,
    ): Promise<LikedReelsPaginatedResponseDto> {
        return this.managementService.getLikedReels(userId, query);
    }

    async getSavedReels(
        userId: string,
        query: InteractedReelsQueryDto,
    ): Promise<SavedReelsPaginatedResponseDto> {
        return this.managementService.getSavedReels(userId, query);
    }

    // -------------------------------------------------------------------------
    // Search
    // -------------------------------------------------------------------------

    async searchReels(
        userId: string,
        dto: SearchReelsQueryDto,
    ): Promise<SearchReelsResponseDto> {
        return this.searchService.searchReels(userId, dto);
    }

    async shareReel(
        userId: string,
        reelId: string,
    ): Promise<ShareReelResponseDto> {
        return this.searchService.shareReel(userId, reelId);
    }

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    async adminUpdateStatus(
        reelId: string,
        dto: AdminUpdateStatusDto,
    ): Promise<AdminStatusUpdateResponseDto> {
        return this.adminService.adminUpdateStatus(reelId, dto);
    }

    async adminGetReels(
        query: AdminGetReelsDto,
    ): Promise<AdminReelsPaginatedResponseDto> {
        return this.adminService.adminGetReels(query);
    }
}
