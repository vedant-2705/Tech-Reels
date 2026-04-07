/**
 * @module modules/admin/admin.service
 * @description
 * Application service implementing all 12 Admin use cases:
 * user search, user detail, user status update, XP grant,
 * report list, report action, reel status update, challenge create,
 * challenge remove, and analytics (summary, top reels, top users).
 *
 * Cross-module dependencies:
 *   - AuthSessionService (AuthModule) - session revocation on suspend/ban
 *   - notification_queue (BullMQ global) - admin_message notifications
 *   - xp_award_queue (BullMQ global) - XP grant/revoke via worker
 *
 * All audit log writes are fire-and-forget via repository.insertAuditLog
 * (the repository swallows errors internally so audit failures never
 * propagate to the HTTP response).
 */

import { Injectable, Logger } from "@nestjs/common";

import { AdminRepository } from "./admin.repository";
import { AuthSessionService } from "@modules/auth/auth-session.service";

import { UserSearchQueryDto } from "./dto/user-search-query.dto";
import { UserStatusUpdateDto } from "./dto/user-status-update.dto";
import { XpGrantDto } from "./dto/xp-grant.dto";
import { ReportsQueryDto } from "./dto/reports-query.dto";
import { ActionReportDto } from "./dto/action-report.dto";
import { AdminReelStatusUpdateDto } from "./dto/admin-reel-status-update.dto";
import { AdminCreateChallengeDto } from "./dto/admin-create-challenge.dto";
import { TopReelsQueryDto } from "./dto/top-reels-query.dto";
import { TopUsersQueryDto } from "./dto/top-users-query.dto";

import {
    AdminUserListResponseDto,
    AdminUserListItemDto,
} from "./dto/admin-user-list-item.dto";
import { AdminUserDetailDto } from "./dto/admin-user-detail.dto";
import { UserStatusUpdateResponseDto } from "./dto/user-status-update.dto";
import { XpGrantResponseDto } from "./dto/xp-grant.dto";
import {
    AdminReportsListResponseDto,
    AdminReportItemDto,
} from "./dto/admin-report-item.dto";
import { ActionReportResponseDto } from "./dto/action-report.dto";
import { AdminReelStatusResponseDto } from "./dto/admin-reel-status-update.dto";
import { AdminChallengeResponseDto } from "./dto/admin-create-challenge.dto";
import { AnalyticsSummaryDto } from "./dto/analytics-summary.dto";
import { TopReelsResponseDto, TopReelItemDto } from "./dto/top-reels-query.dto";
import { TopUsersResponseDto, TopUserItemDto } from "./dto/top-users-query.dto";
import { MessageResponseDto } from "@common/dto/message-response.dto";

import {
    AdminChallengeRow,
    AdminReportRow,
} from "./entities/admin.entity";

import {
    ADMIN_USER_STATUS,
    ADMIN_REEL_STATUS,
    REPORT_ACTION,
    REPORT_STATUS,
    AUDIT_ACTION,
    AUDIT_CATEGORY,
    CHALLENGE_XP_REWARD,
    CHALLENGE_TOKEN_REWARD,
    MAX_CHALLENGES_PER_REEL,
    ADMIN_MESSAGES,
    REVOKE_SESSION_STATUSES,
    TOP_REELS_SORT,
    TOP_USERS_SORT,
    ANALYTICS_PERIOD,
} from "./admin.constants";

import { AdminUserNotFoundException } from "./exceptions/admin-user-not-found.exception";
import { CannotBanAdminException } from "./exceptions/cannot-ban-admin.exception";
import { ReportNotFoundException } from "./exceptions/report-not-found.exception";
import { AdminReelNotFoundException } from "./exceptions/admin-reel-not-found.exception";
import { AdminChallengeNotFoundException } from "./exceptions/admin-challenge-not-found.exception";
import { MaxChallengesException } from "./exceptions/max-challenges.exception";
import { AdminService } from "./admin.service.abstract";
import { MessagingService } from "@modules/messaging";
import { ADMIN_MANIFEST } from "./admin.messaging";
import { AdminMessageJobPayload } from "@modules/notification/notification.interface";
import { XpAwardJobPayload } from "@modules/gamification/gamification.interface";

/**
 * Orchestrates all Admin workflows including user management, moderation,
 * challenge operations, and analytics.
 */
@Injectable()
export class AdminServiceImpl extends AdminService {
    private readonly logger = new Logger(AdminService.name);

    /**
     * @param adminRepository Admin data-access layer.
     * @param authSessionService Cross-module service for session revocation.
     * @param messagingService Messaging service for dispatching notification and XP award jobs.
     */
    constructor(
        private readonly adminRepository: AdminRepository,
        private readonly authSessionService: AuthSessionService,
        private readonly messagingService: MessagingService,
    ) {
        super();
    }

    //  GET /admin/users 

    /** @inheritdoc */
    async searchUsers(
        query: UserSearchQueryDto,
    ): Promise<AdminUserListResponseDto> {
        const limit = query.limit ?? 50;

        const rows = await this.adminRepository.searchUsers({
            q: query.q,
            status: query.status,
            role: query.role,
            cursor: query.cursor,
            limit,
        });

        const hasMore = rows.length > limit;
        const page = rows.slice(0, limit);

        const totalCount =
            page.length > 0 ? parseInt(page[0].total_count, 10) : 0;

        return {
            data: page.map(
                (r): AdminUserListItemDto => ({
                    id: r.id,
                    email: r.email,
                    username: r.username,
                    role: r.role,
                    account_status: r.account_status,
                    total_xp: Number(r.total_xp),
                    current_streak: Number(r.current_streak),
                    created_at: r.created_at,
                    last_active_date: r.last_active_date,
                }),
            ),
            meta: {
                next_cursor: hasMore ? page[page.length - 1].id : null,
                has_more: hasMore,
                total_count: totalCount,
            },
        };
    }

    //  GET /admin/users/:id 

    /** @inheritdoc */
    async getUserDetail(userId: string): Promise<AdminUserDetailDto> {
        const user = await this.adminRepository.findUserById(userId);
        if (!user) throw new AdminUserNotFoundException();

        const [providers, stats] = await Promise.all([
            this.adminRepository.getLinkedProviders(userId),
            this.adminRepository.getUserStats(userId),
        ]);

        return {
            id: user.id,
            email: user.email,
            username: user.username,
            avatar_url: user.avatar_url,
            bio: user.bio,
            role: user.role,
            account_status: user.account_status,
            experience_level: user.experience_level,
            total_xp: Number(user.total_xp),
            token_balance: Number(user.token_balance),
            current_streak: Number(user.current_streak),
            longest_streak: Number(user.longest_streak),
            created_at: user.created_at,
            last_active_date: user.last_active_date,
            linked_providers: providers,
            badges_earned: stats.badges_earned,
            reels_published: stats.reels_published,
            reports_submitted: stats.reports_submitted,
            reports_received: stats.reports_received,
        };
    }

    //  PATCH /admin/users/:id/status 

    /** @inheritdoc */
    async updateUserStatus(
        adminId: string,
        userId: string,
        dto: UserStatusUpdateDto,
    ): Promise<UserStatusUpdateResponseDto> {
        const user = await this.adminRepository.findUserById(userId);
        if (!user) throw new AdminUserNotFoundException();

        // Cannot suspend or ban another admin
        if (
            user.role === "admin" &&
            (dto.status === ADMIN_USER_STATUS.SUSPENDED ||
                dto.status === ADMIN_USER_STATUS.BANNED)
        ) {
            throw new CannotBanAdminException();
        }

        const updated = await this.adminRepository.updateUserStatus(
            userId,
            dto.status,
        );

        // Revoke all sessions immediately for punitive statuses
        if (REVOKE_SESSION_STATUSES.includes(dto.status)) {
            await this.authSessionService.revokeAllSessions(userId);
            await this.authSessionService.incrementTokenVersion(userId);
        }

        const payload: AdminMessageJobPayload = {
            userId,
            meta: {
                ...(dto.reason && { reason: dto.reason }),
            }
        };
        void this.messagingService.dispatchJob(
            ADMIN_MANIFEST.jobs.ADMIN_MESSAGE.jobName,
            payload,
        )

        // Audit log (repository swallows failures internally)
        await this.adminRepository.insertAuditLog({
            adminId,
            action: AUDIT_ACTION.STATUS_CHANGE,
            category: AUDIT_CATEGORY.CONTENT_EVENT,
            entityId: userId,
            entityType: "user",
            payload: { status: dto.status, reason: dto.reason ?? null },
        });

        return {
            id: updated.id,
            account_status: updated.account_status,
            updated_at: updated.updated_at,
        };
    }

    //  POST /admin/users/:id/xp 

    /** @inheritdoc */
    async grantXp(
        adminId: string,
        userId: string,
        dto: XpGrantDto,
    ): Promise<XpGrantResponseDto> {
        const user = await this.adminRepository.findUserById(userId);
        if (!user) throw new AdminUserNotFoundException();

        // Enqueue XP award - actual write is performed by the XP worker
        const payload: XpAwardJobPayload = {
            userId,
            source: "admin_grant",
            xp_amount: dto.delta,
            note: dto.note,
        };
        void this.messagingService.dispatchJob(
            ADMIN_MANIFEST.jobs.XP_AWARD.jobName,
            payload,
        );

        await this.adminRepository.insertAuditLog({
            adminId,
            action: AUDIT_ACTION.XP_GRANT,
            category: AUDIT_CATEGORY.TRANSACTIONAL,
            entityId: userId,
            entityType: "user",
            payload: { delta: dto.delta, note: dto.note },
        });

        return {
            user_id: userId,
            delta: dto.delta,
            new_total_xp: Number(user.total_xp) + dto.delta,
        };
    }

    //  GET /admin/reports 

    /** @inheritdoc */
    async listReports(
        query: ReportsQueryDto,
    ): Promise<AdminReportsListResponseDto> {
        const limit = query.limit ?? 50;

        const rows = await this.adminRepository.findReports({
            status: query.status,
            reason: query.reason,
            cursor: query.cursor,
            limit,
        });

        const hasMore = rows.length > limit;
        const page = rows.slice(0, limit);

        return {
            data: page.map((r): AdminReportItemDto => this.toReportItemDto(r)),
            meta: {
                next_cursor: hasMore ? page[page.length - 1].id : null,
                has_more: hasMore,
            },
        };
    }

    //  PATCH /admin/reports/:id 

    /**
     * 
     * side effects based on the requested action:
     *   - `dismiss`        -> mark dismissed
     *   - `disable_reel`   -> mark actioned + disable reel + evict cache + notify creator
     *   - `warn_creator`   -> mark actioned + notify creator
     *   - `escalate`       -> mark escalated
     * 
     * All paths append to audit log.
     *
     * @inheritdoc
     */
    async actionReport(
        adminId: string,
        reportId: string,
        dto: ActionReportDto,
    ): Promise<ActionReportResponseDto> {
        const report = await this.adminRepository.findReportById(reportId);
        if (!report) throw new ReportNotFoundException();

        let newStatus: string;
        let payload: AdminMessageJobPayload;

        switch (dto.action) {
            case REPORT_ACTION.DISMISS:
                newStatus = REPORT_STATUS.DISMISSED;
                break;

            case REPORT_ACTION.DISABLE_REEL:
                newStatus = REPORT_STATUS.ACTIONED;
                await this.adminRepository.updateAdminReelStatus(
                    report.reel_id,
                    ADMIN_REEL_STATUS.DISABLED,
                );
                await this.adminRepository.evictReelCache(report.reel_id);
                payload = {
                    userId: report.creator_id,
                    meta: {
                        ...(dto.note && { note: dto.note }),
                    }
                };
                void this.messagingService.dispatchJob(
                    ADMIN_MANIFEST.jobs.ADMIN_MESSAGE.jobName,
                    payload,
                );
                break;

            case REPORT_ACTION.WARN_CREATOR:
                newStatus = REPORT_STATUS.ACTIONED;
                payload = {
                    userId: report.creator_id,
                    meta: {
                        ...(dto.note && { note: dto.note }),
                    }
                };
                void this.messagingService.dispatchJob(
                    ADMIN_MANIFEST.jobs.ADMIN_MESSAGE.jobName,
                    payload,
                );
                break;

            case REPORT_ACTION.ESCALATE:
                newStatus = REPORT_STATUS.ESCALATED;
                break;

            default:
                newStatus = REPORT_STATUS.DISMISSED;
        }

        const updated = await this.adminRepository.updateReport(
            reportId,
            newStatus,
            adminId,
        );

        await this.adminRepository.insertAuditLog({
            adminId,
            action: AUDIT_ACTION.REPORT_ACTION,
            category: AUDIT_CATEGORY.CONTENT_EVENT,
            entityId: reportId,
            entityType: "report",
            payload: {
                action: dto.action,
                note: dto.note ?? null,
                reel_id: report.reel_id,
            },
        });

        return {
            report_id: updated.id,
            action_taken: dto.action,
            reviewed_at: updated.reviewed_at,
        };
    }

    //  PATCH /admin/reels/:id/status 

    /**
     * 
     * - Always evicts reel:meta cache.
     * - Notifies creator when disabling.
     * - Appends audit log.
     *
     * @inheritdoc
     */
    async updateReelStatus(
        adminId: string,
        reelId: string,
        dto: AdminReelStatusUpdateDto,
    ): Promise<AdminReelStatusResponseDto> {
        const reel = await this.adminRepository.findAdminReelById(reelId);
        if (!reel) throw new AdminReelNotFoundException();

        const updated = await this.adminRepository.updateAdminReelStatus(
            reelId,
            dto.status,
        );

        // Always evict cache regardless of new status
        await this.adminRepository.evictReelCache(reelId);

        // Notify creator only when disabling
        if (dto.status === ADMIN_REEL_STATUS.DISABLED) {
            const payload: AdminMessageJobPayload = {
                userId: reel.creator_id,
                meta: {
                    ...(dto.note && { note: dto.note }),
                }
            };
            void this.messagingService.dispatchJob(
                ADMIN_MANIFEST.jobs.ADMIN_MESSAGE.jobName,
                payload,
            );
        }

        await this.adminRepository.insertAuditLog({
            adminId,
            action: AUDIT_ACTION.REEL_STATUS_CHANGE,
            category: AUDIT_CATEGORY.CONTENT_EVENT,
            entityId: reelId,
            entityType: "reel",
            payload: { status: dto.status, note: dto.note ?? null },
        });

        return {
            reel_id: updated.id,
            status: updated.status,
            updated_at: updated.updated_at,
        };
    }

    //  POST /admin/reels/:id/challenges 

    /**
     * 
     * Enforces the 3-challenge cap on active (non-deleted) challenges. Auto-sets xp_reward and token_reward from difficulty. Auto-sets order = current_count + 1.
     * 
     * Persists correct_answer as String(dto.correct_answer).
     *
     * @inheritdoc
     */
    async createChallenge(
        adminId: string,
        reelId: string,
        dto: AdminCreateChallengeDto,
    ): Promise<AdminChallengeResponseDto> {
        const reel = await this.adminRepository.findAdminReelById(reelId);
        if (!reel) throw new AdminReelNotFoundException();

        const count = await this.adminRepository.getChallengeCount(reelId);
        if (count >= MAX_CHALLENGES_PER_REEL)
            throw new MaxChallengesException();

        const xpReward = CHALLENGE_XP_REWARD[dto.difficulty] ?? 10;
        const tokenReward = CHALLENGE_TOKEN_REWARD[dto.difficulty] ?? 2;

        const challenge = await this.adminRepository.createChallenge({
            reelId,
            type: dto.type,
            question: dto.question,
            options: dto.options ?? null,
            correctAnswer: String(dto.correct_answer),
            explanation: dto.explanation,
            difficulty: dto.difficulty,
            xpReward,
            tokenReward,
            caseSensitive: dto.case_sensitive ?? false,
            order: count + 1,
        });

        await this.adminRepository.insertAuditLog({
            adminId,
            action: AUDIT_ACTION.CHALLENGE_CREATED,
            category: AUDIT_CATEGORY.CONTENT_EVENT,
            entityId: challenge.id,
            entityType: "challenge",
            payload: { reelId, type: dto.type, difficulty: dto.difficulty },
        });

        return this.toChallengeResponseDto(challenge);
    }

    //  DELETE /admin/reels/:id/challenges/:challengeId 

    /** @inheritdoc */
    async removeChallenge(
        adminId: string,
        reelId: string,
        challengeId: string,
    ): Promise<MessageResponseDto> {
        const reel = await this.adminRepository.findAdminReelById(reelId);
        if (!reel) throw new AdminReelNotFoundException();

        const challenge = await this.adminRepository.findChallengeById(
            challengeId,
            reelId,
        );
        if (!challenge) throw new AdminChallengeNotFoundException();

        await this.adminRepository.softDeleteChallenge(challengeId, reelId);

        await this.adminRepository.insertAuditLog({
            adminId,
            action: AUDIT_ACTION.CHALLENGE_REMOVED,
            category: AUDIT_CATEGORY.CONTENT_EVENT,
            entityId: challengeId,
            entityType: "challenge",
            payload: { reelId },
        });

        return { message: ADMIN_MESSAGES.CHALLENGE_REMOVED };
    }

    //  GET /admin/analytics/summary 

    /** @inheritdoc */
    async getAnalyticsSummary(): Promise<AnalyticsSummaryDto> {
        const [users, reels, challenges, reports, xp] = await Promise.all([
            this.adminRepository.getUserCountStats(),
            this.adminRepository.getReelCountStats(),
            this.adminRepository.getChallengeGlobalStats(),
            this.adminRepository.getReportCountStats(),
            this.adminRepository.getDailyXpTotal(),
        ]);

        return {
            users: {
                total: parseInt(users.total, 10),
                active_today: parseInt(users.active_today, 10),
                new_this_week: parseInt(users.new_this_week, 10),
                suspended: parseInt(users.suspended, 10),
                banned: parseInt(users.banned, 10),
            },
            reels: {
                total: parseInt(reels.total, 10),
                active: parseInt(reels.active, 10),
                processing: parseInt(reels.processing, 10),
                disabled: parseInt(reels.disabled, 10),
                pending_review: parseInt(reels.pending_review, 10),
            },
            challenges: {
                total: parseInt(challenges.total, 10),
                total_attempts: parseInt(challenges.total_attempts, 10),
                correct_rate: parseFloat(challenges.correct_rate),
            },
            reports: {
                pending: parseInt(reports.pending, 10),
                this_week: parseInt(reports.this_week, 10),
            },
            xp: {
                total_awarded_today: parseInt(xp.total_awarded_today, 10),
            },
        };
    }

    //  GET /admin/analytics/top-reels 

    /** @inheritdoc */
    async getTopReels(query: TopReelsQueryDto): Promise<TopReelsResponseDto> {
        const rows = await this.adminRepository.getTopReels({
            sortBy: query.sort_by ?? TOP_REELS_SORT.VIEWS,
            limit: query.limit ?? 20,
            period: query.period ?? ANALYTICS_PERIOD.ALL_TIME,
        });

        return {
            data: rows.map(
                (r): TopReelItemDto => ({
                    id: r.id,
                    title: r.title,
                    creator_username: r.creator_username,
                    status: r.status,
                    difficulty: r.difficulty,
                    view_count: Number(r.view_count),
                    like_count: Number(r.like_count),
                    save_count: Number(r.save_count),
                    report_count: parseInt(r.report_count, 10),
                    created_at: r.created_at,
                }),
            ),
        };
    }

    //  GET /admin/analytics/top-users 

    /** @inheritdoc */
    async getTopUsers(query: TopUsersQueryDto): Promise<TopUsersResponseDto> {
        const rows = await this.adminRepository.getTopUsers({
            sortBy: query.sort_by ?? TOP_USERS_SORT.XP,
            limit: query.limit ?? 20,
        });

        return {
            data: rows.map(
                (r): TopUserItemDto => ({
                    id: r.id,
                    username: r.username,
                    email: r.email,
                    account_status: r.account_status,
                    total_xp: Number(r.total_xp),
                    current_streak: Number(r.current_streak),
                    reels_published: parseInt(r.reels_published, 10),
                    created_at: r.created_at,
                }),
            ),
        };
    }

    //  Private helpers 

    /**
     * Map an AdminReportRow to the AdminReportItemDto response shape.
     *
     * @param r Raw report row from repository.
     * @returns AdminReportItemDto.
     */
    private toReportItemDto(r: AdminReportRow): AdminReportItemDto {
        return {
            id: r.id,
            reason: r.reason,
            details: r.details,
            status: r.status,
            reporter: {
                id: r.reporter_id,
                username: r.reporter_username,
            },
            reel: {
                id: r.reel_id,
                title: r.reel_title,
                creator_username: r.creator_username,
                status: r.reel_status,
            },
            created_at: r.created_at,
        };
    }

    /**
     * Map an AdminChallengeRow to the AdminChallengeResponseDto shape.
     * Parses options from JSONB if present. Does NOT expose correct_answer.
     *
     * @param c Raw challenge row from repository.
     * @returns AdminChallengeResponseDto.
     */
    private toChallengeResponseDto(
        c: AdminChallengeRow,
    ): AdminChallengeResponseDto {
        let options: string[] | null = null;
        if (c.options) {
            try {
                options =
                    typeof c.options === "string"
                        ? (JSON.parse(c.options) as string[])
                        : (c.options as string[]);
            } catch {
                this.logger.warn(
                    `Failed to parse options for challenge ${c.id}`,
                );
            }
        }

        return {
            id: c.id,
            reel_id: c.reel_id,
            type: c.type,
            question: c.question,
            options,
            explanation: c.explanation,
            difficulty: c.difficulty,
            xp_reward: Number(c.xp_reward),
            token_reward: Number(c.token_reward),
            case_sensitive: Boolean(c.case_sensitive),
            order: Number(c.order),
            max_attempts: Number(c.max_attempts),
            created_at: c.created_at,
            updated_at: c.updated_at,
        };
    }
}
