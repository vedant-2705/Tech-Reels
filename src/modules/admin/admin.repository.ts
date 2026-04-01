/**
 * @module modules/admin/admin.repository
 * @description
 * Data-access layer for the Admin module. Covers user management, report
 * moderation, reel status, challenge CRUD, analytics aggregations, and
 * audit log writes.
 *
 * Conventions enforced here:
 *   - Raw SQL only, parameterized queries, no string interpolation from user input.
 *   - Admin read methods do NOT filter deleted_at IS NULL unless explicitly specified.
 *   - Dynamic ORDER BY uses a pre-validated allowlist map - never user-supplied strings.
 *   - Transactions (BEGIN/COMMIT/ROLLBACK) stay in the repository, never the service.
 *   - insertAuditLog is append-only - no read-back, no update, no delete.
 */

import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "@database/database.service";
import { RedisService } from "@redis/redis.service";
import { uuidv7 } from "@common/utils/uuidv7.util";

import {
    AdminUserRow,
    AdminUserListRow,
    AdminUserStatusRow,
    AdminUserStats,
    AdminReportRow,
    AdminReportUpdateRow,
    AdminReelRow,
    AdminReelStatusRow,
    AdminChallengeRow,
    UserCountStats,
    ReelCountStats,
    ChallengeGlobalStats,
    ReportCountStats,
    DailyXpTotal,
    TopReelRow,
    TopUserRow,
    AuditLogInsertData,
} from "./entities/admin.entity";

import {
    TOP_REELS_SORT_COLUMN,
    TOP_USERS_SORT_COLUMN,
    ANALYTICS_PERIOD,
    type TopReelsSort,
    type TopUsersSort,
    type AnalyticsPeriod,
} from "./admin.constants";

import { REELS_REDIS_KEYS } from "@modules/reels/reels.constants";

/** Input shape for searchUsers. */
export interface SearchUsersQuery {
    q?: string;
    status?: string;
    role?: string;
    cursor?: string;
    limit: number;
}

/** Input shape for findReports. */
export interface FindReportsQuery {
    status?: string;
    reason?: string;
    cursor?: string;
    limit: number;
}

/** Input shape for getTopReels. */
export interface GetTopReelsOpts {
    sortBy: TopReelsSort;
    limit: number;
    period: AnalyticsPeriod;
}

/** Input shape for getTopUsers. */
export interface GetTopUsersOpts {
    sortBy: TopUsersSort;
    limit: number;
}

/** Input shape for createChallenge. */
export interface CreateChallengeData {
    reelId: string;
    type: string;
    question: string;
    options: string[] | null;
    correctAnswer: string;
    explanation: string;
    difficulty: string;
    xpReward: number;
    tokenReward: number;
    caseSensitive: boolean;
    order: number;
}

/**
 * Repository handling all persistence and cache operations for the Admin module.
 */
@Injectable()
export class AdminRepository {
    private readonly logger = new Logger(AdminRepository.name);

    /**
     * @param db PostgreSQL database service.
     * @param redis Redis service for cache invalidation.
     */
    constructor(
        private readonly db: DatabaseService,
        private readonly redis: RedisService,
    ) {}

    //  User methods 

    /**
     * Fetch a single user by ID. No deleted_at filter - admin sees all users.
     *
     * @param userId User UUID.
     * @returns AdminUserRow or null if not found.
     */
    async findUserById(userId: string): Promise<AdminUserRow | null> {
        const result = await this.db.query<AdminUserRow>(
            `SELECT id, email, username, avatar_url, bio, role, account_status,
                    experience_level, total_xp, token_balance, current_streak,
                    longest_streak, created_at, updated_at, deleted_at, last_active_date
             FROM users
             WHERE id = $1`,
            [userId],
        );
        return result.rows[0] ?? null;
    }

    /**
     * Paginated user search with optional ILIKE filter on email/username,
     * status filter, and role filter.
     * Uses COUNT(*) OVER() window function to return total_count without
     * a separate COUNT query.
     *
     * @param query Search options including q, status, role, cursor, limit.
     * @returns Array of AdminUserListRow (each row carries total_count).
     */
    async searchUsers(query: SearchUsersQuery): Promise<AdminUserListRow[]> {
        const params: unknown[] = [query.limit + 1];
        const conditions: string[] = [];

        if (query.cursor) {
            params.push(query.cursor);
            conditions.push(`id < $${params.length}`);
        }

        if (query.q) {
            params.push(`%${query.q}%`);
            const idx = params.length;
            conditions.push(`(email ILIKE $${idx} OR username ILIKE $${idx})`);
        }

        if (query.status) {
            params.push(query.status);
            conditions.push(`account_status = $${params.length}`);
        }

        if (query.role) {
            params.push(query.role);
            conditions.push(`role = $${params.length}`);
        }

        const where =
            conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        const result = await this.db.query<AdminUserListRow>(
            `SELECT id, email, username, role, account_status, total_xp,
                    current_streak, created_at, last_active_date,
                    COUNT(*) OVER() AS total_count
             FROM users
             ${where}
             ORDER BY id DESC
             LIMIT $1`,
            params,
        );
        return result.rows;
    }

    /**
     * Fetch OAuth provider names linked to a user account.
     *
     * @param userId User UUID.
     * @returns Array of provider strings (e.g. ['google', 'github']).
     */
    async getLinkedProviders(userId: string): Promise<string[]> {
        const result = await this.db.query<{ provider: string }>(
            `SELECT provider FROM oauth_accounts WHERE user_id = $1`,
            [userId],
        );
        return result.rows.map((r) => r.provider);
    }

    /**
     * Fetch aggregated stats for a user: badges earned, reels published,
     * reports submitted, and reports received on their reels.
     * Runs 4 COUNT queries in parallel via Promise.all.
     *
     * @param userId User UUID.
     * @returns AdminUserStats with all four counts.
     */
    async getUserStats(userId: string): Promise<AdminUserStats> {
        const [badges, reels, submitted, received] = await Promise.all([
            this.db.query<{ count: string }>(
                `SELECT COUNT(*)::text AS count FROM user_badges WHERE user_id = $1`,
                [userId],
            ),
            this.db.query<{ count: string }>(
                `SELECT COUNT(*)::text AS count FROM reels
                 WHERE creator_id = $1 AND deleted_at IS NULL`,
                [userId],
            ),
            this.db.query<{ count: string }>(
                `SELECT COUNT(*)::text AS count FROM reports WHERE reporter_id = $1`,
                [userId],
            ),
            this.db.query<{ count: string }>(
                `SELECT COUNT(*)::text AS count FROM reports rp
                 JOIN reels r ON r.id = rp.reel_id
                 WHERE r.creator_id = $1`,
                [userId],
            ),
        ]);

        return {
            badges_earned: parseInt(badges.rows[0]?.count ?? "0", 10),
            reels_published: parseInt(reels.rows[0]?.count ?? "0", 10),
            reports_submitted: parseInt(submitted.rows[0]?.count ?? "0", 10),
            reports_received: parseInt(received.rows[0]?.count ?? "0", 10),
        };
    }

    /**
     * Update a user's account_status and bump updated_at.
     *
     * @param userId User UUID.
     * @param status New account status string.
     * @returns Minimal AdminUserStatusRow with id, account_status, updated_at.
     */
    async updateUserStatus(
        userId: string,
        status: string,
    ): Promise<AdminUserStatusRow> {
        const result = await this.db.query<AdminUserStatusRow>(
            `UPDATE users
             SET account_status = $2, updated_at = now()
             WHERE id = $1
             RETURNING id, account_status, updated_at`,
            [userId, status],
        );
        return result.rows[0];
    }

    //  Report methods 

    /**
     * Fetch a single report by ID, joined with reporter username, reel title,
     * reel status, and reel creator username.
     *
     * @param reportId Report UUID.
     * @returns AdminReportRow or null if not found.
     */
    async findReportById(reportId: string): Promise<AdminReportRow | null> {
        const result = await this.db.query<AdminReportRow>(
            `SELECT
                rp.id, rp.reason, rp.details, rp.status,
                rp.created_at, rp.reviewed_by, rp.reviewed_at,
                rp.reporter_id,
                u_reporter.username  AS reporter_username,
                rp.reel_id,
                r.title              AS reel_title,
                r.status             AS reel_status,
                r.creator_id,
                u_creator.username   AS creator_username
             FROM reports rp
             JOIN users u_reporter ON u_reporter.id = rp.reporter_id
             JOIN reels r          ON r.id           = rp.reel_id
             JOIN users u_creator  ON u_creator.id   = r.creator_id
             WHERE rp.id = $1`,
            [reportId],
        );
        return result.rows[0] ?? null;
    }

    /**
     * Paginated list of reports with optional status and reason filters.
     * Ordered by created_at DESC, id DESC for stable keyset pagination.
     *
     * @param query Filter and pagination options.
     * @returns Array of AdminReportRow.
     */
    async findReports(query: FindReportsQuery): Promise<AdminReportRow[]> {
        const params: unknown[] = [query.limit + 1];
        const conditions: string[] = [];

        if (query.cursor) {
            params.push(query.cursor);
            conditions.push(`rp.id < $${params.length}`);
        }

        if (query.status) {
            params.push(query.status);
            conditions.push(`rp.status = $${params.length}`);
        }

        if (query.reason) {
            params.push(query.reason);
            conditions.push(`rp.reason = $${params.length}`);
        }

        const where =
            conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        const result = await this.db.query<AdminReportRow>(
            `SELECT
                rp.id, rp.reason, rp.details, rp.status,
                rp.created_at, rp.reviewed_by, rp.reviewed_at,
                rp.reporter_id,
                u_reporter.username  AS reporter_username,
                rp.reel_id,
                r.title              AS reel_title,
                r.status             AS reel_status,
                r.creator_id,
                u_creator.username   AS creator_username
             FROM reports rp
             JOIN users u_reporter ON u_reporter.id = rp.reporter_id
             JOIN reels r          ON r.id           = rp.reel_id
             JOIN users u_creator  ON u_creator.id   = r.creator_id
             ${where}
             ORDER BY rp.created_at DESC, rp.id DESC
             LIMIT $1`,
            params,
        );
        return result.rows;
    }

    /**
     * Update a report's status and record the reviewing admin and timestamp.
     *
     * @param reportId Report UUID.
     * @param status New report status.
     * @param adminId UUID of the admin actioning the report.
     * @returns Minimal AdminReportUpdateRow with id, status, reviewed_at.
     */
    async updateReport(
        reportId: string,
        status: string,
        adminId: string,
    ): Promise<AdminReportUpdateRow> {
        const result = await this.db.query<AdminReportUpdateRow>(
            `UPDATE reports
             SET status      = $2,
                 reviewed_by = $3,
                 reviewed_at = now()
             WHERE id = $1
             RETURNING id, status, reviewed_at`,
            [reportId, status, adminId],
        );
        return result.rows[0];
    }

    //  Reel methods 

    /**
     * Fetch a single reel by ID without deleted_at filter.
     * Admin sees all reels including soft-deleted.
     *
     * @param reelId Reel UUID.
     * @returns AdminReelRow or null if not found.
     */
    async findAdminReelById(reelId: string): Promise<AdminReelRow | null> {
        const result = await this.db.query<AdminReelRow>(
            `SELECT id, creator_id, title, status, difficulty,
                    view_count, like_count, save_count, share_count,
                    created_at, updated_at, deleted_at
             FROM reels
             WHERE id = $1`,
            [reelId],
        );
        return result.rows[0] ?? null;
    }

    /**
     * Update a reel's status and bump updated_at.
     *
     * @param reelId Reel UUID.
     * @param status New reel status string.
     * @returns Minimal AdminReelStatusRow with id, status, updated_at.
     */
    async updateAdminReelStatus(
        reelId: string,
        status: string,
    ): Promise<AdminReelStatusRow> {
        const result = await this.db.query<AdminReelStatusRow>(
            `UPDATE reels
             SET status = $2, updated_at = now()
             WHERE id = $1
             RETURNING id, status, updated_at`,
            [reelId, status],
        );
        return result.rows[0];
    }

    /**
     * Evict the reel metadata cache entry from Redis.
     * Called after any admin status change that affects reel visibility.
     *
     * @param reelId Reel UUID.
     */
    async evictReelCache(reelId: string): Promise<void> {
        await this.redis.del(`${REELS_REDIS_KEYS.META_PREFIX}:${reelId}`);
    }

    //  Challenge methods 

    /**
     * Count active (non-deleted) challenges for a reel.
     * Uses deleted_at IS NULL - soft-deleted challenges do not count toward the cap.
     *
     * @param reelId Reel UUID.
     * @returns Number of active challenges.
     */
    async getChallengeCount(reelId: string): Promise<number> {
        const result = await this.db.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
             FROM challenges
             WHERE reel_id = $1 AND deleted_at IS NULL`,
            [reelId],
        );
        return parseInt(result.rows[0]?.count ?? "0", 10);
    }

    /**
     * Insert a new challenge row.
     *
     * @param data Full challenge creation payload.
     * @returns The newly created AdminChallengeRow.
     */
    async createChallenge(
        data: CreateChallengeData,
    ): Promise<AdminChallengeRow> {
        const id = uuidv7();
        const now = new Date().toISOString();

        const result = await this.db.query<AdminChallengeRow>(
            `INSERT INTO challenges (
                id, reel_id, type, question, options, correct_answer,
                explanation, difficulty, xp_reward, token_reward,
                case_sensitive, "order", max_attempts, created_at, updated_at
             ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10,
                $11, $12, 3, $13, $13
             )
             RETURNING *`,
            [
                id,
                data.reelId,
                data.type,
                data.question,
                data.options ? JSON.stringify(data.options) : null,
                data.correctAnswer,
                data.explanation,
                data.difficulty,
                data.xpReward,
                data.tokenReward,
                data.caseSensitive,
                data.order,
                now,
            ],
        );
        return result.rows[0];
    }

    /**
     * Fetch a single active (non-deleted) challenge by ID and reel ID.
     *
     * @param challengeId Challenge UUID.
     * @param reelId Reel UUID - ensures the challenge belongs to the expected reel.
     * @returns AdminChallengeRow or null if not found or already deleted.
     */
    async findChallengeById(
        challengeId: string,
        reelId: string,
    ): Promise<AdminChallengeRow | null> {
        const result = await this.db.query<AdminChallengeRow>(
            `SELECT * FROM challenges
             WHERE id = $1 AND reel_id = $2 AND deleted_at IS NULL`,
            [challengeId, reelId],
        );
        return result.rows[0] ?? null;
    }

    /**
     * Soft-delete a challenge and reorder the remaining active challenges
     * for the same reel, both in a single transaction.
     *
     * Reorder uses ROW_NUMBER() OVER (ORDER BY "order") on non-deleted challenges
     * to produce a gapless 1-indexed sequence after the deletion.
     *
     * @param challengeId Challenge UUID to soft-delete.
     * @param reelId Reel UUID - used to scope the reorder.
     */
    async softDeleteChallenge(
        challengeId: string,
        reelId: string,
    ): Promise<void> {
        const client = await this.db.getClient();
        try {
            await client.query("BEGIN");

            await client.query(
                `UPDATE challenges
                 SET deleted_at = now(), updated_at = now()
                 WHERE id = $1`,
                [challengeId],
            );

            await client.query(
                `WITH ranked AS (
                     SELECT id,
                            ROW_NUMBER() OVER (ORDER BY "order") AS new_order
                     FROM challenges
                     WHERE reel_id = $1 AND deleted_at IS NULL
                 )
                 UPDATE challenges
                 SET "order"    = ranked.new_order,
                     updated_at = now()
                 FROM ranked
                 WHERE challenges.id = ranked.id`,
                [reelId],
            );

            await client.query("COMMIT");
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }
    }

    //  Analytics methods 

    /**
     * Aggregate user counts using conditional aggregation in a single query.
     * active_today uses last_active_date = CURRENT_DATE (UTC).
     * new_this_week uses created_at >= now() - interval '7 days'.
     *
     * @returns UserCountStats with string-typed numeric fields.
     */
    async getUserCountStats(): Promise<UserCountStats> {
        const result = await this.db.query<UserCountStats>(
            `SELECT
                COUNT(*)::text                                                          AS total,
                COUNT(*) FILTER (WHERE last_active_date = CURRENT_DATE)::text          AS active_today,
                COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days')::text  AS new_this_week,
                COUNT(*) FILTER (WHERE account_status = 'suspended')::text             AS suspended,
                COUNT(*) FILTER (WHERE account_status = 'banned')::text                AS banned
             FROM users`,
        );
        return result.rows[0];
    }

    /**
     * Aggregate reel counts using conditional aggregation in a single query.
     * Total includes all reels; status-specific counts use the status column.
     *
     * @returns ReelCountStats with string-typed numeric fields.
     */
    async getReelCountStats(): Promise<ReelCountStats> {
        const result = await this.db.query<ReelCountStats>(
            `SELECT
                COUNT(*)::text                                                   AS total,
                COUNT(*) FILTER (WHERE status = 'active')::text                 AS active,
                COUNT(*) FILTER (WHERE status = 'processing')::text             AS processing,
                COUNT(*) FILTER (WHERE status = 'disabled')::text               AS disabled,
                COUNT(*) FILTER (WHERE status = 'needs_review')::text           AS pending_review
             FROM reels`,
        );
        return result.rows[0];
    }

    /**
     * Aggregate global challenge stats: total non-deleted challenges,
     * total attempts, and correct rate.
     *
     * @returns ChallengeGlobalStats with string-typed numeric fields.
     */
    async getChallengeGlobalStats(): Promise<ChallengeGlobalStats> {
        const result = await this.db.query<ChallengeGlobalStats>(
            `SELECT
                (SELECT COUNT(*)::text FROM challenges WHERE deleted_at IS NULL) AS total,
                COUNT(*)::text                                                    AS total_attempts,
                COALESCE(
                    ROUND(
                        COUNT(*) FILTER (WHERE is_correct = true)::numeric
                        / NULLIF(COUNT(*), 0),
                        4
                    ),
                    0
                )::text AS correct_rate
             FROM challenges_attempts`,
        );
        return result.rows[0];
    }

    /**
     * Count pending reports and reports submitted in the past 7 days.
     *
     * @returns ReportCountStats with string-typed numeric fields.
     */
    async getReportCountStats(): Promise<ReportCountStats> {
        const result = await this.db.query<ReportCountStats>(
            `SELECT
                COUNT(*) FILTER (WHERE status = 'pending')::text                        AS pending,
                COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days')::text   AS this_week
             FROM reports`,
        );
        return result.rows[0];
    }

    /**
     * Sum all XP delta values from xp_ledger for the current UTC day.
     *
     * @returns DailyXpTotal with string-typed total_awarded_today.
     */
    async getDailyXpTotal(): Promise<DailyXpTotal> {
        const result = await this.db.query<DailyXpTotal>(
            `SELECT COALESCE(SUM(delta), 0)::text AS total_awarded_today
             FROM xp_ledger
             WHERE created_at >= CURRENT_DATE`,
        );
        return result.rows[0];
    }

    /**
     * Fetch top reels ranked by a dynamic metric column, with optional period filter
     * and a LEFT JOIN to count reports per reel.
     *
     * Dynamic ORDER BY is safe: sortBy is validated by class-validator as a
     * TopReelsSort enum value, then mapped to a hardcoded column name via
     * TOP_REELS_SORT_COLUMN - never interpolated directly from user input.
     *
     * @param opts Sort column, limit, and period filter.
     * @returns Array of TopReelRow.
     */
    async getTopReels(opts: GetTopReelsOpts): Promise<TopReelRow[]> {
        const sortCol = TOP_REELS_SORT_COLUMN[opts.sortBy];

        const params: unknown[] = [opts.limit];
        let periodCondition = "";

        if (opts.period === ANALYTICS_PERIOD.TODAY) {
            periodCondition = `AND r.created_at >= CURRENT_DATE`;
        } else if (opts.period === ANALYTICS_PERIOD.THIS_WEEK) {
            periodCondition = `AND r.created_at >= now() - interval '7 days'`;
        }

        const result = await this.db.query<TopReelRow>(
            `SELECT
                r.id,
                r.title,
                u.username         AS creator_username,
                r.status,
                r.difficulty,
                r.view_count,
                r.like_count,
                r.save_count,
                COUNT(rp.id)::text AS report_count,
                r.created_at
             FROM reels r
             JOIN users u ON u.id = r.creator_id
             LEFT JOIN reports rp ON rp.reel_id = r.id
             WHERE r.deleted_at IS NULL
               ${periodCondition}
             GROUP BY r.id, u.username
             ORDER BY ${sortCol} DESC
             LIMIT $1`,
            params,
        );
        return result.rows;
    }

    /**
     * Fetch top users ranked by a dynamic metric, with a COUNT subquery
     * for reels_published.
     *
     * Dynamic ORDER BY is safe: sortBy validated by class-validator, mapped to
     * a hardcoded column via TOP_USERS_SORT_COLUMN.
     *
     * @param opts Sort column and limit.
     * @returns Array of TopUserRow.
     */
    async getTopUsers(opts: GetTopUsersOpts): Promise<TopUserRow[]> {
        const sortCol = TOP_USERS_SORT_COLUMN[opts.sortBy];

        const result = await this.db.query<TopUserRow>(
            `SELECT
                u.id,
                u.username,
                u.email,
                u.account_status,
                u.total_xp,
                u.current_streak,
                COUNT(r.id)::text AS reels_published,
                u.created_at
             FROM users u
             LEFT JOIN reels r
                ON r.creator_id = u.id AND r.deleted_at IS NULL
             WHERE u.deleted_at IS NULL
             GROUP BY u.id
             ORDER BY ${sortCol} DESC
             LIMIT $1`,
            [opts.limit],
        );
        return result.rows;
    }

    //  Audit log 

    /**
     * Append a row to the audit_log table. Append-only - no read-back ever.
     * Failures are logged but never re-thrown; audit log writes must never
     * block or roll back the primary action that triggered them.
     *
     * @param data Audit log insert payload.
     */
    async insertAuditLog(data: AuditLogInsertData): Promise<void> {
        const id = uuidv7();
        try {
            await this.db.query(
                `INSERT INTO audit_log (
                    id, event_type, category, user_id,
                    entity_id, entity_type, payload, created_at
                 ) VALUES (
                    $1, $2, $3, $4,
                    $5, $6, $7, now()
                 )`,
                [
                    id,
                    data.action,
                    data.category,
                    data.adminId,
                    data.entityId,
                    data.entityType,
                    JSON.stringify(data.payload),
                ],
            );
        } catch (err) {
            this.logger.error(
                `insertAuditLog failed - action=${data.action} entity=${data.entityId}: ${(err as Error).message}`,
            );
        }
    }
}
