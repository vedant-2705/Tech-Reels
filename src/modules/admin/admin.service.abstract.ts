/**
 * @module modules/admin/admin.service.abstract
 * @description
 * Abstract class contract for the admin service.
 *
 * Consumers (controllers, guards, other services) depend on this
 * abstract class rather than the concrete implementation. NestJS DI
 * is wired in the module so that injecting `AdminService` resolves
 * to `AdminServiceImpl`.
 */

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
import { AnalyticsSummaryDto } from "./dto/analytics-summary.dto";
import { MessageResponseDto } from "@common/dto/message-response.dto";

export abstract class AdminService {
    /**
     * Search and list users with optional ILIKE filter, status/role filters, and cursor pagination.
     *
     * @param query Search and pagination parameters.
     * @returns Paginated user list with total_count metadata.
     */
    abstract searchUsers(
        query: UserSearchQueryDto,
    ): Promise<AdminUserListResponseDto>;

    /**
     * Fetch full user profile visible to admins.
     *
     * @param userId Target user UUID.
     * @returns Full AdminUserDetailDto.
     */
    abstract getUserDetail(userId: string): Promise<AdminUserDetailDto>;

    /**
     * Update a user's account status.
     *
     * @param adminId UUID of the admin performing the action.
     * @param userId Target user UUID.
     * @param dto Status and optional reason.
     */
    abstract updateUserStatus(
        adminId: string,
        userId: string,
        dto: UserStatusUpdateDto,
    ): Promise<UserStatusUpdateResponseDto>;

    /**
     * Grant or revoke XP for a user.
     *
     * @param adminId UUID of the admin performing the action.
     * @param userId Target user UUID.
     * @param dto Delta and required note.
     */
    abstract grantXp(
        adminId: string,
        userId: string,
        dto: XpGrantDto,
    ): Promise<XpGrantResponseDto>;

    /**
     * List reports with optional status and reason filters.
     *
     * @param query Filter and pagination parameters.
     * @returns Paginated report list.
     */
    abstract listReports(
        query: ReportsQueryDto,
    ): Promise<AdminReportsListResponseDto>;

    /**
     * Action a moderation report.
     *
     * @param adminId UUID of the admin performing the action.
     * @param reportId Report UUID.
     * @param dto Action and optional note.
     */
    abstract actionReport(
        adminId: string,
        reportId: string,
        dto: ActionReportDto,
    ): Promise<ActionReportResponseDto>;

    /**
     * Update reel status via the admin endpoint.
     *
     * @param adminId UUID of the admin performing the action.
     * @param reelId Reel UUID.
     * @param dto New status and optional note.
     */
    abstract updateReelStatus(
        adminId: string,
        reelId: string,
        dto: AdminReelStatusUpdateDto,
    ): Promise<AdminReelStatusResponseDto>;

    /**
     * Create a challenge on a reel.
     *
     * @param adminId UUID of the admin creating the challenge.
     * @param reelId Reel UUID.
     * @param dto Challenge creation payload.
     */
    abstract createChallenge(
        adminId: string,
        reelId: string,
        dto: AdminCreateChallengeDto,
    ): Promise<AdminChallengeResponseDto>;

    /**
     * Soft-delete a challenge from a reel and reorder remaining challenges.
     *
     * @param adminId UUID of the admin removing the challenge.
     * @param reelId Reel UUID.
     * @param challengeId Challenge UUID.
     */
    abstract removeChallenge(
        adminId: string,
        reelId: string,
        challengeId: string,
    ): Promise<MessageResponseDto>;

    /**
     * Fetch platform-wide analytics summary.
     *
     * @returns AnalyticsSummaryDto.
     */
    abstract getAnalyticsSummary(): Promise<AnalyticsSummaryDto>;

    /**
     * Fetch top reels ranked by the requested metric and period.
     *
     * @param query Sort, limit, and period parameters.
     * @returns TopReelsResponseDto with ranked reel list.
     */
    abstract getTopReels(query: TopReelsQueryDto): Promise<TopReelsResponseDto>;

    /**
     * Fetch top users ranked by the requested metric.
     *
     * @param query Sort and limit parameters.
     * @returns TopUsersResponseDto with ranked user list.
     */
    abstract getTopUsers(query: TopUsersQueryDto): Promise<TopUsersResponseDto>;
}
