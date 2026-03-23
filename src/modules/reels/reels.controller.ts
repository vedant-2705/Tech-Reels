/**
 * @module modules/reels/reels.controller
 * @description
 * HTTP controller exposing all 15 Reels endpoints.
 * Route ordering is deliberate - static segments (/me, /feed, /admin)
 * are declared before the dynamic :id segment to prevent NestJS from
 * treating them as UUID parameters.
 */

import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
} from "@nestjs/common";
import {
    ApiBearerAuth,
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from "@nestjs/swagger";

import { ReelsService } from "./reels.service";

import { CreateReelDto } from "./dto/create-reel.dto";
import { ConfirmReelDto } from "./dto/confirm-reel.dto";
import { UpdateReelDto } from "./dto/update-reel.dto";
import { WatchReelDto } from "./dto/watch-reel.dto";
import { ReportReelDto } from "./dto/report-reel.dto";
import { AdminUpdateStatusDto } from "./dto/admin-update-status.dto";
import { AdminGetReelsDto } from "./dto/admin-get-reels.dto";
import { MyReelsQueryDto } from "./dto/my-reels-query.dto";
import { FeedQueryDto } from "./dto/feed-query.dto";

import { CreateReelResponseDto } from "./dto/create-reel-response.dto";
import { ReelResponseDto } from "./dto/reel-response.dto";
import { FeedResponseDto } from "./dto/feed-response.dto";
import { MyReelsPaginatedResponseDto } from "./dto/my-reels-paginated-response.dto";
import { AdminReelsPaginatedResponseDto } from "./dto/admin-reels-paginated-response.dto";
import { AdminStatusUpdateResponseDto } from "./dto/admin-status-update-response.dto";

import { CurrentUser } from "@common/decorators/current-user.decorator";
import { Roles } from "@common/decorators/roles.decorator";
import { SetRateLimit } from "@common/guards/rate-limit.guard";
import { SkipAuth } from "@common/decorators/skip-auth.decorator";

import { REELS_RATE_LIMITS } from "./reels.constants";
import { ApiErrorDto } from "@common/dto/api-error.dto";
import { MessageResponseDto } from "@common/dto/message-response.dto";

/**
 * Reels controller - upload, feed, interactions, and admin endpoints.
 */
@ApiTags("Reels")
@ApiBearerAuth("access-token")
@Controller("reels")
export class ReelsController {
    /**
     * @param reelsService Reels application service.
     */
    constructor(private readonly reelsService: ReelsService) {}

    // Static routes - declared before :id

    /**
     * Return a paginated list of the authenticated creator's own reels.
     *
     * @param userId Authenticated user UUID from JWT context.
     * @param query Pagination and status filter query params.
     * @returns Paginated reel list with cursor metadata.
     */
    @Get("me")
    @HttpCode(HttpStatus.OK)
    @SetRateLimit({ limit: 60, windowSeconds: 60, scope: "user" })
    @ApiOperation({
        summary: "List own reels",
        description:
            "Returns all reels created by the authenticated user across all statuses " +
            "(uploading, processing, active, failed, disabled). Supports cursor pagination.",
    })
    @ApiResponse({
        status: 200,
        description: "Reel list returned.",
        type: MyReelsPaginatedResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    async getMyReels(
        @CurrentUser("userId") userId: string,
        @Query() query: MyReelsQueryDto,
    ): Promise<MyReelsPaginatedResponseDto> {
        return this.reelsService.getMyReels(userId, query);
    }

    /**
     * Return the authenticated user's personalised feed.
     *
     * @param userId Authenticated user UUID from JWT context.
     * @param query Integer cursor and limit.
     * @returns Paginated feed with is_liked / is_saved per item.
     */
    @Get("feed")
    @HttpCode(HttpStatus.OK)
    @SetRateLimit({ limit: 60, windowSeconds: 60, scope: "user" })
    @ApiOperation({
        summary: "Get personalised feed",
        description:
            "Returns ranked feed items from the pre-built Redis List cache. " +
            "On cold cache (empty list) enqueues a rebuild and returns a DB fallback. " +
            "Publishes FEED_LOW event when fewer than 15 items remain.",
    })
    @ApiResponse({
        status: 200,
        description: "Feed returned.",
        type: FeedResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    async getFeed(
        @CurrentUser("userId") userId: string,
        @Query() query: FeedQueryDto,
    ): Promise<FeedResponseDto> {
        return this.reelsService.getFeed(userId, query);
    }

    /**
     * Admin: list all reels with optional filters.
     *
     * @param query Admin filter and pagination query params.
     * @returns Paginated reel list including creator info.
     */
    @Get("admin")
    @HttpCode(HttpStatus.OK)
    @Roles("admin")
    @ApiOperation({
        summary: "Admin - list all reels",
        description:
            "Returns all reels with optional status and creator filters. " +
            "Requires admin role.",
    })
    @ApiResponse({
        status: 200,
        description: "Admin reel list returned.",
        type: AdminReelsPaginatedResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 403,
        description: "Forbidden - admin only.",
        type: ApiErrorDto,
    })
    async adminGetReels(
        @Query() query: AdminGetReelsDto,
    ): Promise<AdminReelsPaginatedResponseDto> {
        return this.reelsService.adminGetReels(query);
    }

    // Create - POST /reels

    /**
     * Initiate a reel upload. Returns a presigned S3 PUT URL.
     *
     * @param userId Authenticated user UUID from JWT context.
     * @param dto Create reel payload.
     * @returns Presigned upload URL, reel ID, S3 key, and expiry.
     */
    @Post()
    @HttpCode(HttpStatus.CREATED)
    @SetRateLimit(REELS_RATE_LIMITS.CREATE)
    @ApiOperation({
        summary: "Create reel + get upload URL",
        description:
            "Creates a reel row (status=uploading) and returns a presigned S3 PUT URL. " +
            "Client uploads raw video directly to S3 - server never handles video bytes. " +
            "Call POST /reels/:id/confirm after upload completes. " +
            "Rate limited to 5 per hour per user.",
    })
    @ApiResponse({
        status: 201,
        description: "Reel created, upload URL returned.",
        type: CreateReelResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: "Validation failed.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 409,
        description: "Upload already in progress for this user.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 422,
        description: "One or more tag_ids do not exist.",
        type: ApiErrorDto,
    })
    async createReel(
        @CurrentUser("userId") userId: string,
        @Body() dto: CreateReelDto,
    ): Promise<CreateReelResponseDto> {
        return this.reelsService.createReel(userId, dto);
    }

    // Confirm - POST /reels/:id/confirm

    /**
     * Confirm a completed S3 upload and queue video processing.
     *
     * @param userId Authenticated user UUID from JWT context.
     * @param id Reel UUID from route parameter.
     * @param dto Confirm payload containing raw_key.
     * @returns Reel ID, processing status, and message.
     */
    @Post(":id/confirm")
    @HttpCode(HttpStatus.OK)
    @SetRateLimit(REELS_RATE_LIMITS.CONFIRM)
    @ApiOperation({
        summary: "Confirm upload + start processing",
        description:
            "Verifies the S3 object exists, moves reel to processing status, " +
            "and queues the MediaConvert transcoding job. " +
            "Rate limited to 5 per hour per user.",
    })
    @ApiParam({ name: "id", description: "Reel UUID" })
    @ApiResponse({ status: 200, description: "Processing queued." })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 404,
        description: "Reel not found.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 422,
        description: "Invalid or mismatched raw_key.",
        type: ApiErrorDto,
    })
    async confirmReel(
        @CurrentUser("userId") userId: string,
        @Param("id", ParseUUIDPipe) id: string,
        @Body() dto: ConfirmReelDto,
    ) {
        return this.reelsService.confirmReel(userId, id, dto);
    }

    // Get single (public) - GET /reels/:id

    /**
     * Return a single active reel by ID (public, no auth required).
     *
     * @param id Reel UUID from route parameter.
     * @returns ReelResponseDto for active reels.
     */
    @Get(":id")
    @SkipAuth()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: "Get reel by ID (public)",
        description:
            "Returns reel metadata for active reels. " +
            "Non-active reels (processing, disabled, deleted) return 404. " +
            "Serves from reel:meta cache (TTL 300s); populates cache on miss.",
    })
    @ApiParam({ name: "id", description: "Reel UUID" })
    @ApiResponse({
        status: 200,
        description: "Reel returned.",
        type: ReelResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: "Reel not found or not active.",
        type: ApiErrorDto,
    })
    async getReelById(
        @Param("id", ParseUUIDPipe) id: string,
    ): Promise<ReelResponseDto> {
        return this.reelsService.getReelById(id);
    }

    // Update - PATCH /reels/:id

    /**
     * Update title, description, difficulty, or tags of an owned reel.
     *
     * @param userId Authenticated user UUID from JWT context.
     * @param id Reel UUID from route parameter.
     * @param dto Partial update payload.
     * @returns Updated ReelResponseDto.
     */
    @Patch(":id")
    @HttpCode(HttpStatus.OK)
    @SetRateLimit(REELS_RATE_LIMITS.UPDATE)
    @ApiOperation({
        summary: "Update reel metadata",
        description:
            "Updates title, description, difficulty, and/or tags. " +
            "tag_ids replaces all existing tags when provided. " +
            "Only the creator can update their own reel. " +
            "Blocked for status: processing | needs_review | disabled | deleted. " +
            "Allowed for status: uploading | active | failed. " +
            "Rate limited to 20 per hour per user.",
    })
    @ApiParam({ name: "id", description: "Reel UUID" })
    @ApiResponse({
        status: 200,
        description: "Reel updated.",
        type: ReelResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: "Validation failed.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 403,
        description: "Forbidden - not owner or wrong status.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 404,
        description: "Reel not found.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 422,
        description: "Invalid tag_ids.",
        type: ApiErrorDto,
    })
    async updateReel(
        @CurrentUser("userId") userId: string,
        @Param("id", ParseUUIDPipe) id: string,
        @Body() dto: UpdateReelDto,
    ): Promise<ReelResponseDto> {
        return this.reelsService.updateReel(userId, id, dto);
    }

    // Delete - DELETE /reels/:id

    /**
     * Soft-delete an owned reel.
     *
     * @param userId Authenticated user UUID from JWT context.
     * @param id Reel UUID from route parameter.
     * @returns Success message.
     */
    @Delete(":id")
    @HttpCode(HttpStatus.OK)
    @SetRateLimit(REELS_RATE_LIMITS.DELETE)
    @ApiOperation({
        summary: "Delete reel",
        description:
            "Soft-deletes the reel (status=deleted). Removes from Redis tag sets. " +
            "Publishes REEL_DELETED event. Only the creator can delete their own reel. " +
            "Rate limited to 10 per hour per user.",
    })
    @ApiParam({ name: "id", description: "Reel UUID" })
    @ApiResponse({
        status: 200,
        description: "Reel deleted.",
        type: MessageResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 403,
        description: "Forbidden - not owner.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 404,
        description: "Reel not found.",
        type: ApiErrorDto,
    })
    async deleteReel(
        @CurrentUser("userId") userId: string,
        @Param("id", ParseUUIDPipe) id: string,
    ): Promise<MessageResponseDto> {
        return this.reelsService.deleteReel(userId, id);
    }

    // Watch - POST /reels/:id/watch

    /**
     * Record watch telemetry for a reel. Returns 204 immediately.
     * All side effects are async via pub/sub.
     *
     * @param userId Authenticated user UUID from JWT context.
     * @param id Reel UUID from route parameter.
     * @param dto Watch duration and completion percentage.
     * @returns void (204 No Content).
     */
    @Post(":id/watch")
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: "Record watch event",
        description:
            "Publishes REEL_WATCH_ENDED event and returns 204 immediately. " +
            "DB write, Bloom filter update (BF.ADD), and view count increment " +
            "(HINCRBY) are all handled asynchronously by the pub/sub subscriber.",
    })
    @ApiParam({ name: "id", description: "Reel UUID" })
    @ApiResponse({ status: 204, description: "Watch event recorded." })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 404,
        description: "Reel not found.",
        type: ApiErrorDto,
    })
    async watchReel(
        @CurrentUser("userId") userId: string,
        @Param("id", ParseUUIDPipe) id: string,
        @Body() dto: WatchReelDto,
    ): Promise<void> {
        await this.reelsService.watchReel(userId, id, dto);
    }

    // Like - POST /reels/:id/like

    /**
     * Like a reel.
     *
     * @param userId Authenticated user UUID from JWT context.
     * @param id Reel UUID from route parameter.
     * @returns liked: true.
     */
    @Post(":id/like")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: "Like a reel",
        description:
            "Inserts a like row (ON CONFLICT DO NOTHING - idempotent). " +
            "Increments like_count in reel:meta cache (HINCRBY). " +
            "Publishes REEL_LIKED to user_interactions.",
    })
    @ApiParam({ name: "id", description: "Reel UUID" })
    @ApiResponse({
        status: 200,
        description: "Reel liked.",
        schema: { example: { liked: true } },
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 404,
        description: "Reel not found.",
        type: ApiErrorDto,
    })
    async likeReel(
        @CurrentUser("userId") userId: string,
        @Param("id", ParseUUIDPipe) id: string,
    ): Promise<{ liked: boolean }> {
        return this.reelsService.likeReel(userId, id);
    }

    // Unlike - DELETE /reels/:id/like

    /**
     * Remove a like from a reel.
     *
     * @param userId Authenticated user UUID from JWT context.
     * @param id Reel UUID from route parameter.
     * @returns liked: false.
     */
    @Delete(":id/like")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: "Unlike a reel",
        description:
            "Removes the like row. " +
            "Decrements like_count in reel:meta cache (HINCRBY -1). " +
            "Publishes REEL_UNLIKED to user_interactions.",
    })
    @ApiParam({ name: "id", description: "Reel UUID" })
    @ApiResponse({
        status: 200,
        description: "Reel unliked.",
        schema: { example: { liked: false } },
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 404,
        description: "Reel not found.",
        type: ApiErrorDto,
    })
    async unlikeReel(
        @CurrentUser("userId") userId: string,
        @Param("id", ParseUUIDPipe) id: string,
    ): Promise<{ liked: boolean }> {
        return this.reelsService.unlikeReel(userId, id);
    }

    // Save - POST /reels/:id/save

    /**
     * Save a reel to the user's collection.
     *
     * @param userId Authenticated user UUID from JWT context.
     * @param id Reel UUID from route parameter.
     * @returns saved: true.
     */
    @Post(":id/save")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: "Save a reel",
        description:
            "Inserts a save row (ON CONFLICT DO NOTHING - idempotent). " +
            "Increments save_count in reel:meta cache (HINCRBY). " +
            "Publishes REEL_SAVED to user_interactions.",
    })
    @ApiParam({ name: "id", description: "Reel UUID" })
    @ApiResponse({
        status: 200,
        description: "Reel saved.",
        schema: { example: { saved: true } },
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 404,
        description: "Reel not found.",
        type: ApiErrorDto,
    })
    async saveReel(
        @CurrentUser("userId") userId: string,
        @Param("id", ParseUUIDPipe) id: string,
    ): Promise<{ saved: boolean }> {
        return this.reelsService.saveReel(userId, id);
    }

    // Unsave - DELETE /reels/:id/save

    /**
     * Remove a reel from the user's saved collection.
     *
     * @param userId Authenticated user UUID from JWT context.
     * @param id Reel UUID from route parameter.
     * @returns saved: false.
     */
    @Delete(":id/save")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: "Unsave a reel",
        description:
            "Removes the save row. " +
            "Decrements save_count in reel:meta cache (HINCRBY -1). " +
            "Publishes REEL_UNSAVED to user_interactions.",
    })
    @ApiParam({ name: "id", description: "Reel UUID" })
    @ApiResponse({
        status: 200,
        description: "Reel unsaved.",
        schema: { example: { saved: false } },
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 404,
        description: "Reel not found.",
        type: ApiErrorDto,
    })
    async unsaveReel(
        @CurrentUser("userId") userId: string,
        @Param("id", ParseUUIDPipe) id: string,
    ): Promise<{ saved: boolean }> {
        return this.reelsService.unsaveReel(userId, id);
    }

    // Report - POST /reels/:id/report

    /**
     * Submit a content report for a reel.
     *
     * @param userId Authenticated reporter user UUID from JWT context.
     * @param id Reported reel UUID from route parameter.
     * @param dto Report reason and optional details.
     * @returns Success message.
     */
    @Post(":id/report")
    @HttpCode(HttpStatus.OK)
    @SetRateLimit(REELS_RATE_LIMITS.REPORT)
    @ApiOperation({
        summary: "Report a reel",
        description:
            "Submits a moderation report. One report per user per reel - " +
            "duplicate submissions are silently ignored (ON CONFLICT DO NOTHING). " +
            "Rate limited to 3 per hour per user.",
    })
    @ApiParam({ name: "id", description: "Reel UUID" })
    @ApiResponse({
        status: 200,
        description: "Report submitted.",
        type: MessageResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: "Validation failed.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 404,
        description: "Reel not found.",
        type: ApiErrorDto,
    })
    async reportReel(
        @CurrentUser("userId") userId: string,
        @Param("id", ParseUUIDPipe) id: string,
        @Body() dto: ReportReelDto,
    ): Promise<MessageResponseDto> {
        return this.reelsService.reportReel(userId, id, dto);
    }

    // Admin status - PATCH /reels/:id/status

    /**
     * Admin: update reel status (active / disabled / needs_review).
     *
     * @param id Reel UUID from route parameter.
     * @param dto Admin status update payload.
     * @returns Updated reel id, status, and updated_at.
     */
    @Patch(":id/status")
    @HttpCode(HttpStatus.OK)
    @Roles("admin")
    @ApiOperation({
        summary: "Admin - update reel status",
        description:
            "Sets reel status to active, disabled, or needs_review. " +
            "active -> SADD to tag Redis Sets, invalidate tags cache. " +
            "disabled -> SREM from tag Redis Sets, invalidate tags cache. " +
            "Publishes REEL_STATUS_CHANGED to content_events. " +
            "Requires admin role.",
    })
    @ApiParam({ name: "id", description: "Reel UUID" })
    @ApiResponse({
        status: 200,
        description: "Status updated.",
        type: AdminStatusUpdateResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 403,
        description: "Forbidden - admin only.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 404,
        description: "Reel not found.",
        type: ApiErrorDto,
    })
    async adminUpdateStatus(
        @Param("id", ParseUUIDPipe) id: string,
        @Body() dto: AdminUpdateStatusDto,
    ): Promise<AdminStatusUpdateResponseDto> {
        return this.reelsService.adminUpdateStatus(id, dto);
    }
}
