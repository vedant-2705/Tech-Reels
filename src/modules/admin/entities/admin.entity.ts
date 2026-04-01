/**
 * @module modules/admin/entities/admin.entity
 * @description
 * TypeScript interfaces representing raw DB row shapes returned by AdminRepository
 * queries. These are internal types - never exposed directly in HTTP responses.
 * Response DTOs are mapped from these in the service layer.
 */

import { AuditAction, AuditCategory } from "../admin.constants";

//  User shapes 

/**
 * Full user row returned by findUserById.
 * No deleted_at filter - admin sees all users including soft-deleted.
 */
export interface AdminUserRow extends Record<string, unknown> {
    id: string;
    email: string;
    username: string;
    avatar_url: string | null;
    bio: string | null;
    role: string;
    account_status: string;
    experience_level: string;
    total_xp: number;
    token_balance: number;
    current_streak: number;
    longest_streak: number;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    last_active_date: string | null;
}

/**
 * Lighter user shape returned by searchUsers list query.
 * Includes total_count from COUNT(*) OVER() window function.
 */
export interface AdminUserListRow extends Record<string, unknown> {
    id: string;
    email: string;
    username: string;
    role: string;
    account_status: string;
    total_xp: number;
    current_streak: number;
    created_at: string;
    last_active_date: string | null;
    /** Window function total across all matching rows - present on every row. */
    total_count: string;
}

/**
 * Minimal shape returned by updateUserStatus.
 */
export interface AdminUserStatusRow extends Record<string, unknown> {
    id: string;
    account_status: string;
    updated_at: string;
}

/**
 * Aggregated stats for a single user - assembled from 4 parallel COUNT queries.
 */
export interface AdminUserStats {
    badges_earned: number;
    reels_published: number;
    reports_submitted: number;
    reports_received: number;
}

//  Report shapes 

/**
 * Full report row with joined reporter username, reel title, reel creator username,
 * and reel status. Returned by findReportById and findReports.
 */
export interface AdminReportRow extends Record<string, unknown> {
    id: string;
    reason: string;
    details: string | null;
    status: string;
    created_at: string;
    reviewed_by: string | null;
    reviewed_at: string | null;
    /** Joined from users (reporter). */
    reporter_id: string;
    reporter_username: string;
    /** Joined from reels. */
    reel_id: string;
    reel_title: string;
    reel_status: string;
    /** Joined from users (reel creator). */
    creator_id: string;
    creator_username: string;
}

/**
 * Minimal shape returned by updateReport.
 */
export interface AdminReportUpdateRow extends Record<string, unknown> {
    id: string;
    status: string;
    reviewed_at: string;
}

//  Reel shapes 

/**
 * Full reel row returned by findAdminReelById.
 * No deleted_at filter - admin sees all reels.
 */
export interface AdminReelRow extends Record<string, unknown> {
    id: string;
    creator_id: string;
    title: string;
    status: string;
    difficulty: string;
    view_count: number;
    like_count: number;
    save_count: number;
    share_count: number;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
}

/**
 * Minimal shape returned by updateAdminReelStatus.
 */
export interface AdminReelStatusRow extends Record<string, unknown> {
    id: string;
    status: string;
    updated_at: string;
}

//  Challenge shapes 

/**
 * Full challenge row returned by createChallenge and findChallengeById.
 */
export interface AdminChallengeRow extends Record<string, unknown> {
    id: string;
    reel_id: string;
    type: string;
    question: string;
    options: unknown | null;
    /** Never exposed in HTTP responses - used internally only. */
    correct_answer: string;
    explanation: string;
    difficulty: string;
    xp_reward: number;
    token_reward: number;
    case_sensitive: boolean;
    order: number;
    max_attempts: number;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
}

//  Analytics shapes 

/**
 * Result of getUserCountStats - single query using FILTER clauses.
 */
export interface UserCountStats extends Record<string, unknown> {
    total: string;
    active_today: string;
    new_this_week: string;
    suspended: string;
    banned: string;
}

/**
 * Result of getReelCountStats - single query using FILTER clauses.
 */
export interface ReelCountStats extends Record<string, unknown> {
    total: string;
    active: string;
    processing: string;
    disabled: string;
    pending_review: string;
}

/**
 * Result of getChallengeGlobalStats.
 */
export interface ChallengeGlobalStats extends Record<string, unknown> {
    total: string;
    total_attempts: string;
    correct_rate: string;
}

/**
 * Result of getReportCountStats.
 */
export interface ReportCountStats extends Record<string, unknown> {
    pending: string;
    this_week: string;
}

/**
 * Result of getDailyXpTotal.
 */
export interface DailyXpTotal extends Record<string, unknown> {
    total_awarded_today: string;
}

/**
 * Single row returned by getTopReels - reel data + report_count JOIN.
 */
export interface TopReelRow extends Record<string, unknown> {
    id: string;
    title: string;
    creator_username: string;
    status: string;
    difficulty: string;
    view_count: number;
    like_count: number;
    save_count: number;
    report_count: string;
    created_at: string;
}

/**
 * Single row returned by getTopUsers - user data + reels_published JOIN.
 */
export interface TopUserRow extends Record<string, unknown> {
    id: string;
    username: string;
    email: string;
    account_status: string;
    total_xp: number;
    current_streak: number;
    reels_published: string;
    created_at: string;
}

//  Audit log 

/**
 * Input shape for insertAuditLog. Never read back - append-only.
 */
export interface AuditLogInsertData {
    /** Admin's user UUID performing the action. */
    adminId: string;
    /** The type of action taken - maps to AUDIT_ACTION constants. */
    action: AuditAction;
    /** Category matching the audit_category DB enum. */
    category: AuditCategory;
    /** UUID of the entity being acted upon (user, reel, report, challenge). */
    entityId: string;
    /** Human-readable entity type label stored in entity_type column. */
    entityType: string;
    /** Arbitrary JSON payload capturing action context. */
    payload: Record<string, unknown>;
}
