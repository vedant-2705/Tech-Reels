/**
 * @module modules/admin/admin.constants
 * @description
 * All string literals, numeric constants, and enum-like values used across
 * the Admin module. Never hardcode these values anywhere else.
 */

//  User status 

/**
 * Admin-settable user account statuses.
 * Maps to the account_status CHECK constraint on the users table.
 */
export const ADMIN_USER_STATUS = {
    SUSPENDED: "suspended",
    BANNED: "banned",
    ACTIVE: "active",
    DEACTIVATED: "deactivated",
} as const;

export type AdminUserStatus =
    (typeof ADMIN_USER_STATUS)[keyof typeof ADMIN_USER_STATUS];

export const ADMIN_USER_STATUSES = Object.values(
    ADMIN_USER_STATUS,
) as AdminUserStatus[];

//  Reel status 

/**
 * Admin-settable reel statuses.
 * 'featured' is NOT included - it does not exist in the reel_status DB enum.
 */
export const ADMIN_REEL_STATUS = {
    ACTIVE: "active",
    DISABLED: "disabled",
    NEEDS_REVIEW: "needs_review",
} as const;

export type AdminReelStatus =
    (typeof ADMIN_REEL_STATUS)[keyof typeof ADMIN_REEL_STATUS];

export const ADMIN_REEL_STATUSES = Object.values(
    ADMIN_REEL_STATUS,
) as AdminReelStatus[];

//  Report action 

/**
 * Actions an admin can take when actioning a report.
 */
export const REPORT_ACTION = {
    DISMISS: "dismiss",
    DISABLE_REEL: "disable_reel",
    WARN_CREATOR: "warn_creator",
    ESCALATE: "escalate",
} as const;

export type ReportAction = (typeof REPORT_ACTION)[keyof typeof REPORT_ACTION];

export const REPORT_ACTIONS = Object.values(REPORT_ACTION) as ReportAction[];

//  Report status 

/**
 * Report lifecycle statuses. Matches the report_status DB enum exactly.
 */
export const REPORT_STATUS = {
    PENDING: "pending",
    ACTIONED: "actioned",
    DISMISSED: "dismissed",
    ESCALATED: "escalated",
} as const;

export type ReportStatus = (typeof REPORT_STATUS)[keyof typeof REPORT_STATUS];

export const REPORT_STATUSES = Object.values(REPORT_STATUS) as ReportStatus[];

//  Audit log action 

/**
 * Audit log event type strings written to audit_log.event_type.
 */
export const AUDIT_ACTION = {
    STATUS_CHANGE: "status_change",
    XP_GRANT: "xp_grant",
    REEL_STATUS_CHANGE: "reel_status_change",
    REPORT_ACTION: "report_action",
    CHALLENGE_CREATED: "challenge_created",
    CHALLENGE_REMOVED: "challenge_removed",
} as const;

export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];

export const AUDIT_ACTIONS = Object.values(AUDIT_ACTION) as AuditAction[];

//  Audit category 

/**
 * Audit log category. Matches the audit_category DB enum exactly.
 * Maps to the pub/sub channel taxonomy in Foundation §14.
 */
export const AUDIT_CATEGORY = {
    USER_INTERACTION: "user_interaction",
    VIDEO_TELEMETRY: "video_telemetry",
    TRANSACTIONAL: "transactional",
    CONTENT_EVENT: "content_event",
} as const;

export type AuditCategory =
    (typeof AUDIT_CATEGORY)[keyof typeof AUDIT_CATEGORY];

export const AUDIT_CATEGORIES = Object.values(
    AUDIT_CATEGORY,
) as AuditCategory[];

//  Analytics sort options 

/**
 * Sort columns for GET /admin/analytics/top-reels.
 */
export const TOP_REELS_SORT = {
    VIEWS: "views",
    LIKES: "likes",
    SAVES: "saves",
} as const;

export type TopReelsSort = (typeof TOP_REELS_SORT)[keyof typeof TOP_REELS_SORT];

export const TOP_REELS_SORTS = Object.values(TOP_REELS_SORT) as TopReelsSort[];

/**
 * Safe column-name map for TOP_REELS_SORT values.
 * Used in repository to avoid dynamic SQL injection from user input.
 */
export const TOP_REELS_SORT_COLUMN: Record<TopReelsSort, string> = {
    views: "r.view_count",
    likes: "r.like_count",
    saves: "r.save_count",
};

/**
 * Sort columns for GET /admin/analytics/top-users.
 */
export const TOP_USERS_SORT = {
    XP: "xp",
    STREAK: "streak",
    REELS_PUBLISHED: "reels_published",
} as const;

export type TopUsersSort = (typeof TOP_USERS_SORT)[keyof typeof TOP_USERS_SORT];

export const TOP_USERS_SORTS = Object.values(TOP_USERS_SORT) as TopUsersSort[];

/**
 * Safe column-name map for TOP_USERS_SORT values.
 * Used in repository to avoid dynamic SQL injection from user input.
 */
export const TOP_USERS_SORT_COLUMN: Record<TopUsersSort, string> = {
    xp: "u.total_xp",
    streak: "u.current_streak",
    reels_published: "reels_published",
};

/**
 * Time period filter for analytics endpoints.
 */
export const ANALYTICS_PERIOD = {
    TODAY: "today",
    THIS_WEEK: "this_week",
    ALL_TIME: "all_time",
} as const;

export type AnalyticsPeriod =
    (typeof ANALYTICS_PERIOD)[keyof typeof ANALYTICS_PERIOD];

export const ANALYTICS_PERIODS = Object.values(
    ANALYTICS_PERIOD,
) as AnalyticsPeriod[];

//  Challenge rewards 

/**
 * XP reward auto-assigned by difficulty when admin creates a challenge.
 * Mirrors the reward tiers used across the Challenges module.
 */
export const CHALLENGE_XP_REWARD: Record<string, number> = {
    beginner: 10,
    intermediate: 20,
    advanced: 30,
} as const;

/**
 * Token reward auto-assigned by difficulty when admin creates a challenge.
 */
export const CHALLENGE_TOKEN_REWARD: Record<string, number> = {
    beginner: 2,
    intermediate: 4,
    advanced: 6,
} as const;

/**
 * Maximum number of non-deleted challenges allowed per reel.
 */
export const MAX_CHALLENGES_PER_REEL = 3;

//  Messages 

/**
 * User-facing success messages returned by Admin endpoints.
 */
export const ADMIN_MESSAGES = {
    CHALLENGE_REMOVED: "Challenge removed successfully",
} as const;

//  Notification type 

/**
 * Notification type string enqueued to notification_queue by Admin actions.
 */
export const ADMIN_NOTIFICATION_TYPE = "admin_message" as const;

//  Statuses that require session revocation 

/**
 * User statuses that require immediate session revocation when applied.
 * suspended and banned force all existing tokens to be invalidated.
 */
export const REVOKE_SESSION_STATUSES: AdminUserStatus[] = [
    ADMIN_USER_STATUS.SUSPENDED,
    ADMIN_USER_STATUS.BANNED,
];
