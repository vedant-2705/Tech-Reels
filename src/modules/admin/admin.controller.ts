/**
 * @module modules/admin/admin.controller
 * @description
 * HTTP controller exposing all 12 Admin endpoints under the /admin prefix.
 * Every route requires admin role (enforced via @Roles('admin') + RolesGuard).
 *
 * Route ordering: static segments (/analytics/summary, /analytics/top-reels,
 * /analytics/top-users) are declared before dynamic (:id) segments to prevent
 * NestJS from treating them as UUID parameters.
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

import { AdminService } from "./admin.service";

import { UserSearchQueryDto } from "./dto/user-search-query.dto";
import {
    UserStatusUpdateDto,
    UserStatusUpdateResponseDto,
} from "./dto/user-status-update.dto";
import { XpGrantDto, XpGrantResponseDto } from "./dto/xp-grant.dto";
import { ReportsQueryDto } from "./dto/reports-query.dto";
import {
    ActionReportDto,
    ActionReportResponseDto,
} from "./dto/action-report.dto";
import {
    AdminReelStatusUpdateDto,
    AdminReelStatusResponseDto,
} from "./dto/admin-reel-status-update.dto";
import {
    AdminCreateChallengeDto,
    AdminChallengeResponseDto,
} from "./dto/admin-create-challenge.dto";
import { AnalyticsSummaryDto } from "./dto/analytics-summary.dto";
import {
    TopReelsQueryDto,
    TopReelsResponseDto,
} from "./dto/top-reels-query.dto";
import {
    TopUsersQueryDto,
    TopUsersResponseDto,
} from "./dto/top-users-query.dto";
import { AdminUserListResponseDto } from "./dto/admin-user-list-item.dto";
import { AdminUserDetailDto } from "./dto/admin-user-detail.dto";
import { AdminReportsListResponseDto } from "./dto/admin-report-item.dto";

import { CurrentUser } from "@common/decorators/current-user.decorator";
import { Roles } from "@common/decorators/roles.decorator";
import { ApiErrorDto } from "@common/dto/api-error.dto";
import { MessageResponseDto } from "@common/dto/message-response.dto";

/**
 * Admin controller - all endpoints require role = admin.
 */
@ApiTags("Admin")
@ApiBearerAuth("access-token")
@Roles("admin")
@Controller("admin")
export class AdminController {
    /**
     * @param adminService Admin application service.
     */
    constructor(private readonly adminService: AdminService) {}

    //  Static routes first 

    /**
     * Fetch platform-wide analytics summary.
     *
     * @returns AnalyticsSummaryDto.
     */
    @Get("analytics/summary")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: "Analytics summary",
        description:
            "Returns platform-wide counts for users, reels, challenges, reports, and XP. " +
            "All sub-queries run in parallel. " +
            "view_count is eventually consistent (up to 60s behind). " +
            "Requires admin role.",
    })
    @ApiResponse({
        status: 200,
        description: "Analytics summary returned.",
        type: AnalyticsSummaryDto,
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
    async getAnalyticsSummary(): Promise<AnalyticsSummaryDto> {
        return this.adminService.getAnalyticsSummary();
    }

    /**
     * Fetch top reels ranked by a metric, with optional period filter.
     *
     * @param query Sort, limit, and period parameters.
     * @returns TopReelsResponseDto with ranked reel list and report_count per reel.
     */
    @Get("analytics/top-reels")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: "Top reels analytics",
        description:
            "Returns reels ranked by views, likes, or saves. " +
            "Includes report_count per reel. " +
            "Supports period filter: today, this_week, all_time. " +
            "Requires admin role.",
    })
    @ApiResponse({
        status: 200,
        description: "Top reels returned.",
        type: TopReelsResponseDto,
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
        description: "Forbidden - admin only.",
        type: ApiErrorDto,
    })
    async getTopReels(
        @Query() query: TopReelsQueryDto,
    ): Promise<TopReelsResponseDto> {
        return this.adminService.getTopReels(query);
    }

    /**
     * Fetch top users ranked by a metric.
     *
     * @param query Sort and limit parameters.
     * @returns TopUsersResponseDto with ranked user list.
     */
    @Get("analytics/top-users")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: "Top users analytics",
        description:
            "Returns users ranked by XP, current streak, or reels published. " +
            "Requires admin role.",
    })
    @ApiResponse({
        status: 200,
        description: "Top users returned.",
        type: TopUsersResponseDto,
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
        description: "Forbidden - admin only.",
        type: ApiErrorDto,
    })
    async getTopUsers(
        @Query() query: TopUsersQueryDto,
    ): Promise<TopUsersResponseDto> {
        return this.adminService.getTopUsers(query);
    }

    //  User routes 

    /**
     * Search and list users with optional filters and cursor pagination.
     *
     * @param query Search, filter, and pagination parameters.
     * @returns Paginated user list with total_count.
     */
    @Get("users")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: "List / search users",
        description:
            "Returns a paginated list of all users. " +
            "Supports free-text ILIKE search on email and username (q), " +
            "status filter, role filter, and cursor pagination. " +
            "Default limit 50, max 100. " +
            "total_count reflects the full result set size. " +
            "Requires admin role.",
    })
    @ApiResponse({
        status: 200,
        description: "User list returned.",
        type: AdminUserListResponseDto,
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
        description: "Forbidden - admin only.",
        type: ApiErrorDto,
    })
    async searchUsers(
        @Query() query: UserSearchQueryDto,
    ): Promise<AdminUserListResponseDto> {
        return this.adminService.searchUsers(query);
    }

    /**
     * Fetch full user profile including linked providers and aggregate stats.
     *
     * @param id Target user UUID.
     * @returns Full AdminUserDetailDto.
     */
    @Get("users/:id")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: "Get user detail",
        description:
            "Returns a full user profile visible to admins, including linked OAuth providers, " +
            "badges earned, reels published, and reports submitted/received. " +
            "No deleted_at filter - admin can view soft-deleted users. " +
            "Requires admin role.",
    })
    @ApiParam({ name: "id", description: "User UUID" })
    @ApiResponse({
        status: 200,
        description: "User detail returned.",
        type: AdminUserDetailDto,
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
        description: "User not found.",
        type: ApiErrorDto,
    })
    async getUserDetail(
        @Param("id", ParseUUIDPipe) id: string,
    ): Promise<AdminUserDetailDto> {
        return this.adminService.getUserDetail(id);
    }

    /**
     * Update a user's account status (suspend, ban, reactivate, deactivate).
     *
     * @param adminId Authenticated admin UUID from JWT.
     * @param id Target user UUID.
     * @param dto New status and optional reason.
     * @returns Updated id, account_status, updated_at.
     */
    @Patch("users/:id/status")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: "Update user status",
        description:
            "Sets a user account to suspended, banned, active, or deactivated. " +
            "suspended/banned: immediately revokes all sessions and increments token_version. " +
            "Cannot suspend or ban another admin account - returns 409. " +
            "Enqueues admin_message notification. Appends audit log. " +
            "Requires admin role.",
    })
    @ApiParam({ name: "id", description: "Target user UUID" })
    @ApiResponse({
        status: 200,
        description: "User status updated.",
        type: UserStatusUpdateResponseDto,
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
        description: "Forbidden - admin only.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 404,
        description: "User not found.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 409,
        description: "Cannot suspend or ban another admin.",
        type: ApiErrorDto,
    })
    async updateUserStatus(
        @CurrentUser("userId") adminId: string,
        @Param("id", ParseUUIDPipe) id: string,
        @Body() dto: UserStatusUpdateDto,
    ): Promise<UserStatusUpdateResponseDto> {
        return this.adminService.updateUserStatus(adminId, id, dto);
    }

    /**
     * Grant or revoke XP for a user.
     *
     * @param adminId Authenticated admin UUID from JWT.
     * @param id Target user UUID.
     * @param dto Delta (positive = grant, negative = revoke) and required note.
     * @returns user_id, delta, and optimistic new_total_xp.
     */
    @Post("users/:id/xp")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: "Grant / revoke XP",
        description:
            "Enqueues an xp_award job with source=admin_grant. " +
            "Returns optimistic new_total_xp = current_xp + delta - " +
            "actual write is done asynchronously by the XP worker. " +
            "Range: delta -10000 to +10000. Note is required and stored in xp_ledger. " +
            "Appends audit log. Requires admin role.",
    })
    @ApiParam({ name: "id", description: "Target user UUID" })
    @ApiResponse({
        status: 200,
        description: "XP adjustment enqueued.",
        type: XpGrantResponseDto,
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
        description: "Forbidden - admin only.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 404,
        description: "User not found.",
        type: ApiErrorDto,
    })
    async grantXp(
        @CurrentUser("userId") adminId: string,
        @Param("id", ParseUUIDPipe) id: string,
        @Body() dto: XpGrantDto,
    ): Promise<XpGrantResponseDto> {
        return this.adminService.grantXp(adminId, id, dto);
    }

    //  Report routes 

    /**
     * List reports with optional status and reason filters.
     *
     * @param query Filter and pagination parameters.
     * @returns Paginated report list.
     */
    @Get("reports")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: "List reports",
        description:
            "Returns a paginated list of moderation reports. " +
            "Defaults to status=pending when omitted. " +
            "Supports reason filter and cursor pagination. " +
            "Default limit 50, max 100. " +
            "Requires admin role.",
    })
    @ApiResponse({
        status: 200,
        description: "Report list returned.",
        type: AdminReportsListResponseDto,
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
        description: "Forbidden - admin only.",
        type: ApiErrorDto,
    })
    async listReports(
        @Query() query: ReportsQueryDto,
    ): Promise<AdminReportsListResponseDto> {
        return this.adminService.listReports(query);
    }

    /**
     * Action a moderation report (dismiss, disable_reel, warn_creator, escalate).
     *
     * @param adminId Authenticated admin UUID from JWT.
     * @param id Report UUID.
     * @param dto Action and optional note.
     * @returns report_id, action_taken, reviewed_at.
     */
    @Patch("reports/:id")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: "Action a report",
        description:
            "Actions a pending report. " +
            "dismiss: closes without action. " +
            "disable_reel: disables reel + evicts reel:meta cache + notifies creator. " +
            "warn_creator: notifies creator without disabling reel. " +
            "escalate: flags for senior review. " +
            "All paths write to audit_log. Requires admin role.",
    })
    @ApiParam({ name: "id", description: "Report UUID" })
    @ApiResponse({
        status: 200,
        description: "Report actioned.",
        type: ActionReportResponseDto,
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
        description: "Forbidden - admin only.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 404,
        description: "Report not found.",
        type: ApiErrorDto,
    })
    async actionReport(
        @CurrentUser("userId") adminId: string,
        @Param("id", ParseUUIDPipe) id: string,
        @Body() dto: ActionReportDto,
    ): Promise<ActionReportResponseDto> {
        return this.adminService.actionReport(adminId, id, dto);
    }

    //  Reel routes 

    /**
     * Update reel status via the more powerful admin endpoint.
     *
     * @param adminId Authenticated admin UUID from JWT.
     * @param id Reel UUID.
     * @param dto New status and optional note.
     * @returns reel_id, status, updated_at.
     */
    @Patch("reels/:id/status")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: "Admin reel status update",
        description:
            "Sets reel status to active, disabled, or needs_review. " +
            '"featured" is NOT valid - does not exist in the reel_status DB enum. ' +
            "Always evicts reel:meta:{reelId} from Redis. " +
            "If disabled: enqueues admin_message notification to creator. " +
            "Writes to audit_log. " +
            "Distinct from PATCH /reels/:id/status - this version is richer and audit-logged. " +
            "Requires admin role.",
    })
    @ApiParam({ name: "id", description: "Reel UUID" })
    @ApiResponse({
        status: 200,
        description: "Reel status updated.",
        type: AdminReelStatusResponseDto,
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
        description: "Forbidden - admin only.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 404,
        description: "Reel not found.",
        type: ApiErrorDto,
    })
    async updateReelStatus(
        @CurrentUser("userId") adminId: string,
        @Param("id", ParseUUIDPipe) id: string,
        @Body() dto: AdminReelStatusUpdateDto,
    ): Promise<AdminReelStatusResponseDto> {
        return this.adminService.updateReelStatus(adminId, id, dto);
    }

    /**
     * Create a challenge on a reel. Max 3 active challenges per reel.
     *
     * @param adminId Authenticated admin UUID from JWT.
     * @param id Reel UUID.
     * @param dto Challenge creation payload.
     * @returns Full AdminChallengeResponseDto (201).
     */
    @Post("reels/:id/challenges")
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({
        summary: "Create challenge on reel",
        description:
            "Adds a new challenge to a reel. " +
            "xp_reward is auto-set from difficulty: beginner=10, intermediate=20, advanced=30. " +
            "order is auto-set to current_count + 1. " +
            "correct_answer for mcq/true_false: 0-indexed position as string or number. " +
            "correct_answer for code_fill/output_prediction: exact expected string. " +
            "Max 3 active challenges per reel - returns 409 if cap is reached. " +
            "Writes to audit_log. Requires admin role.",
    })
    @ApiParam({ name: "id", description: "Reel UUID" })
    @ApiResponse({
        status: 201,
        description: "Challenge created.",
        type: AdminChallengeResponseDto,
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
        description: "Forbidden - admin only.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 404,
        description: "Reel not found.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 409,
        description: "Max 3 challenges per reel reached.",
        type: ApiErrorDto,
    })
    async createChallenge(
        @CurrentUser("userId") adminId: string,
        @Param("id", ParseUUIDPipe) id: string,
        @Body() dto: AdminCreateChallengeDto,
    ): Promise<AdminChallengeResponseDto> {
        return this.adminService.createChallenge(adminId, id, dto);
    }

    /**
     * Soft-delete a challenge from a reel and reorder remaining challenges.
     *
     * @param adminId Authenticated admin UUID from JWT.
     * @param id Reel UUID.
     * @param cId Challenge UUID.
     * @returns Success message.
     */
    @Delete("reels/:id/challenges/:cId")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: "Remove challenge from reel",
        description:
            "Soft-deletes a challenge. " +
            "Remaining active challenges are immediately reordered to a gapless 1-indexed sequence. " +
            "Both soft-delete and reorder run in a single DB transaction. " +
            "Writes to audit_log. Requires admin role.",
    })
    @ApiParam({ name: "id", description: "Reel UUID" })
    @ApiParam({ name: "cId", description: "Challenge UUID" })
    @ApiResponse({
        status: 200,
        description: "Challenge removed.",
        type: MessageResponseDto,
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
        description: "Reel or challenge not found.",
        type: ApiErrorDto,
    })
    async removeChallenge(
        @CurrentUser("userId") adminId: string,
        @Param("id", ParseUUIDPipe) id: string,
        @Param("cId", ParseUUIDPipe) cId: string,
    ): Promise<MessageResponseDto> {
        return this.adminService.removeChallenge(adminId, id, cId);
    }
}
