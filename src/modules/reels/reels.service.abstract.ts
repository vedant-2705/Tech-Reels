/**
 * @module modules/reels/reels.service.abstract
 * @description
 * Abstract class contract for the reels application service.
 *
 * Controllers and any cross-module consumers depend on this abstract
 * class.  DI is wired in ReelsModule so `ReelsService` (token) resolves
 * to `ReelsServiceImpl` (concrete class).
 */

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

export abstract class ReelsService {
    /** Initiate reel creation - stores a draft and returns a presigned upload URL.
     *
     * @param userId Authenticated creator's user UUID.
     * @param dto Create reel payload.
     * @returns Presigned upload URL, reel ID, raw S3 key, and expiry timestamp.
     */
    abstract createReel(
        userId: string,
        dto: CreateReelDto,
    ): Promise<CreateReelResponseDto>;

    /** Confirm a reel after the video upload has completed.
     *
     * @param userId Authenticated creator's user UUID.
     * @param reelId Reel UUID from the route parameter.
     * @param dto Confirm payload containing raw_key.
     * @returns Reel ID, new status, and confirmation message.
     */
    abstract confirmReel(
        userId: string,
        reelId: string,
        dto: ConfirmReelDto,
    ): Promise<{ reel_id: string; status: string; message: string }>;

    /**
     * Update mutable fields of a reel owned by the authenticated user.
     * If tag_ids are provided, all existing tags are replaced.
     * Only reels with status uploading | active | failed may be updated.
     *
     * @param userId Authenticated user UUID.
     * @param reelId Reel UUID from route parameter.
     * @param dto Partial update payload.
     * @returns Updated reel as ReelResponseDto.
     */
    abstract updateReel(
        userId: string,
        reelId: string,
        dto: UpdateReelDto,
    ): Promise<ReelResponseDto>;

    /**
     * Soft-delete a reel owned by the authenticated user.
     *
     * @param userId Authenticated user UUID.
     * @param reelId Reel UUID from route parameter.
     * @returns Success message.
     */
    abstract deleteReel(
        userId: string,
        reelId: string,
    ): Promise<MessageResponseDto>;

    /** Return the authenticated user's own reels (cursor-paginated).
     * Returns all statuses (uploading, processing, active, failed, etc.).
     *
     * @param userId Authenticated user UUID.
     * @param query Cursor pagination and optional status filter.
     * @returns Paginated reel list with cursor metadata.
     */
    abstract getMyReels(
        userId: string,
        query: MyReelsQueryDto,
    ): Promise<MyReelsPaginatedResponseDto>;

    /** Return the personalised feed for a user. 
     * 
     * @param userId Authenticated user UUID.
     * @param query Integer cursor and limit.
     * @returns Paginated feed items with is_liked / is_saved flags.
     */
    abstract getFeed(
        userId: string,
        query: FeedQueryDto,
    ): Promise<FeedResponseDto>;

    /** Return a single active reel by ID. 
     * Only active reels are visible - any other status returns 404.
     *
     * @param reelId Reel UUID from route parameter.
     * @returns ReelResponseDto for active reels.
     */
    abstract getReelById(reelId: string): Promise<ReelResponseDto>;

    /** Record a watch event and publish telemetry. 
     *
     * @param userId Authenticated user UUID.
     * @param reelId Reel UUID from route parameter.
     * @param dto Watch telemetry payload.
     */
    abstract watchReel(
        userId: string,
        reelId: string,
        role: string,
        dto: WatchReelDto,
    ): Promise<void>;

    /** Like a reel. Returns the current liked state. 
     *
     * @param userId Authenticated user UUID.
     * @param reelId Reel UUID.
     * @returns liked flag.
     */
    abstract likeReel(
        userId: string,
        reelId: string,
    ): Promise<{ liked: boolean }>;

    /** Unlike a reel. Returns the current liked state.
     *
     * @param userId Authenticated user UUID.
     * @param reelId Reel UUID.
     * @returns liked flag set to false.
     */
    abstract unlikeReel(
        userId: string,
        reelId: string,
    ): Promise<{ liked: boolean }>;

    /** Save a reel to the user's collection. Returns the current saved state. 
     *
     * @param userId Authenticated user UUID.
     * @param reelId Reel UUID.
     * @returns saved flag.
     */
    abstract saveReel(
        userId: string,
        reelId: string,
    ): Promise<{ saved: boolean }>;

    /**
     * Remove a saved reel.
     *
     * @param userId Authenticated user UUID.
     * @param reelId Reel UUID.
     * @returns saved flag set to false.
     */
    abstract unsaveReel(
        userId: string,
        reelId: string,
    ): Promise<{ saved: boolean }>;

    /** Report a reel for moderation. One report per user per reel.
     *
     * @param userId Authenticated reporter user UUID.
     * @param reelId Reported reel UUID.
     * @param dto Report payload.
     * @returns Success message.
     */
    abstract reportReel(
        userId: string,
        reelId: string,
        dto: ReportReelDto,
    ): Promise<MessageResponseDto>;

    /** Admin: update a reel's status (active / disabled / etc.). 
     *
     * @param reelId Reel UUID.
     * @param dto Admin status update payload.
     * @returns Updated reel id, status, and updated_at.
     */
    abstract adminUpdateStatus(
        reelId: string,
        dto: AdminUpdateStatusDto,
    ): Promise<AdminStatusUpdateResponseDto>;

    /** Admin: return all reels with optional filters (cursor-paginated).
     *
     * @param query Admin list query params (status, creator_id, cursor, limit).
     * @returns Paginated reel list with cursor metadata.
     */
    abstract adminGetReels(
        query: AdminGetReelsDto,
    ): Promise<AdminReelsPaginatedResponseDto>;

    /** Increment share count and return a shareable URL. 
     *
     * @param userId Authenticated user UUID.
     * @param reelId Reel UUID from route parameter.
     * @returns shared flag and shareable URL.
     */
    abstract shareReel(
        userId: string,
        reelId: string,
    ): Promise<ShareReelResponseDto>;

    /** Return the reels a user has liked (cursor-paginated).
     *
     * @param userId Authenticated user UUID.
     * @param query Cursor and limit query params.
     * @returns Paginated liked reels with interaction flags.
     */
    abstract getLikedReels(
        userId: string,
        query: InteractedReelsQueryDto,
    ): Promise<LikedReelsPaginatedResponseDto>;

    /** Return the reels a user has saved (cursor-paginated).
     * 
     * @param userId Authenticated user UUID.
     * @param query Cursor and limit query params.
     * @returns Paginated saved reels with interaction flags.
     */
    abstract getSavedReels(
        userId: string,
        query: InteractedReelsQueryDto,
    ): Promise<SavedReelsPaginatedResponseDto>;

    /** Full-text / tag search across active reels (offset-paginated). 
     * 
     * @param userId Authenticated user UUID.
     * @param dto Search query params (q, cursor, limit).
     * @returns Paginated search results with matched tag metadata.
     */
    abstract searchReels(
        userId: string,
        dto: SearchReelsQueryDto,
    ): Promise<SearchReelsResponseDto>;

    /** Return active reels created by a given creator (cursor-paginated). 
     * 
     * @param creatorId Creator user UUID from route parameter.
     * @returns List of active reels by the creator.
     */
    abstract getReelsByCreator(
        creatorId: string,
        query: MyReelsQueryDto,
    ): Promise<MyReelsPaginatedResponseDto>;
}
