/**
 * @module modules/gamification/gamification.constants
 * @description
 * All shared constants for the Gamification module: XP sources, token
 * rewards, pub/sub channels, queue job names, Redis key prefixes, cache
 * TTLs, streak configuration, leaderboard configuration, and badge event
 * strings.
 *
 * Import these constants everywhere - never hardcode strings or numbers.
 */

import {
    PUBSUB_VIDEO_TELEMETRY,
    PUBSUB_CONTENT_EVENTS,
} from "@common/constants/redis-keys.constants";

// ---------------------------------------------------------------------------
// XP sources (must match xp_source enum in migration 005 exactly)
// ---------------------------------------------------------------------------

/**
 * Valid xp_source enum values. These strings are written to xp_ledger.source
 * and must never change once data exists.
 */
export const XP_SOURCE = {
    CHALLENGE_CORRECT: "challenge_correct",
    REEL_WATCH: "reel_watch",
    STREAK_BONUS: "streak_bonus",
    PATH_COMPLETED: "path_completed",
    ADMIN_GRANT: "admin_grant",
} as const;

export type XpSource = (typeof XP_SOURCE)[keyof typeof XP_SOURCE];

// ---------------------------------------------------------------------------
// XP reward amounts per source
// ---------------------------------------------------------------------------

/**
 * XP awarded per reel watch event.
 * Only awarded once per unique reel per user (deduplication via xp_ledger).
 */
export const REEL_WATCH_XP_REWARD = 5;

/**
 * XP awarded for maintaining a daily streak (awarded by streak reset worker
 * when streak is incremented, not on every watch).
 * Scales with streak length: base * Math.min(streak, STREAK_BONUS_CAP).
 */
export const STREAK_BONUS_BASE_XP = 10;

/**
 * Maximum streak multiplier cap. Streak bonus = base * min(streak, cap).
 * Prevents runaway XP for very long streaks.
 */
export const STREAK_BONUS_CAP = 7;

// ---------------------------------------------------------------------------
// Token reward amounts per source
// ---------------------------------------------------------------------------

/**
 * Tokens awarded per reel watch event.
 */
export const REEL_WATCH_TOKEN_REWARD = 1;

/**
 * Tokens awarded per streak bonus event.
 */
export const STREAK_BONUS_TOKEN_REWARD = 2;

// ---------------------------------------------------------------------------
// Streak configuration
// ---------------------------------------------------------------------------

/**
 * Number of grace days before a streak resets.
 * Grace period: if last_active_date is exactly (today - 2 days),
 * streak_freeze_until is set to tomorrow instead of resetting.
 * If last_active_date is older than grace period, streak resets to 0.
 */
export const STREAK_GRACE_DAYS = 1;

// ---------------------------------------------------------------------------
// Leaderboard configuration
// ---------------------------------------------------------------------------

/**
 * Number of top tags to track per user for leaderboard participation.
 * The user's top N tags (by affinity score) each get a leaderboard entry.
 */
export const LEADERBOARD_TOP_TAGS_COUNT = 3;

/**
 * TTL in seconds for the top_tags:{userId} cache entry.
 * 1 hour - affinity scores change on every watch event.
 */
export const TOP_TAGS_CACHE_TTL = 3600;

// ---------------------------------------------------------------------------
// Topic affinity configuration
// ---------------------------------------------------------------------------

/**
 * Affinity score increment per reel watch event for each of the reel's tags.
 */
export const AFFINITY_WATCH_INCREMENT = 0.5;

/**
 * Maximum affinity score per tag per user.
 * Prevents a single tag from dominating indefinitely.
 */
export const AFFINITY_MAX_SCORE = 100.0;

// ---------------------------------------------------------------------------
// Pub/Sub channels and events
// ---------------------------------------------------------------------------

/**
 * Pub/Sub channel for gamification events.
 * Mirrors CHALLENGES_PUBSUB_CHANNEL - same channel, different events.
 */
export const GAMIFICATION_PUBSUB_CHANNEL = "gamification_events";

/**
 * Pub/Sub channel for SSE cross-pod notifications.
 */
export const SSE_EVENTS_CHANNEL = "sse_events";

/**
 * Pub/Sub channel for video telemetry events (REEL_WATCH_ENDED source).
 */
export const VIDEO_TELEMETRY_CHANNEL = PUBSUB_VIDEO_TELEMETRY;

/**
 * Pub/Sub channel for content events (PATH_COMPLETED source).
 */
export const CONTENT_EVENTS_CHANNEL = PUBSUB_CONTENT_EVENTS;

/**
 * Events published by the Gamification module.
 */
export const GAMIFICATION_EVENTS = {
    XP_AWARDED: "XP_AWARDED",
    BADGE_EARNED: "BADGE_EARNED",
} as const;

/**
 * Events the Gamification subscriber listens for.
 */
export const GAMIFICATION_INBOUND_EVENTS = {
    REEL_WATCH_ENDED: "REEL_WATCH_ENDED",
    PATH_COMPLETED: "PATH_COMPLETED",
} as const;

// ---------------------------------------------------------------------------
// Queue job names
// ---------------------------------------------------------------------------

/**
 * BullMQ job names used in xp_award_queue.
 */
export const GAMIFICATION_XP_JOBS = {
    XP_AWARD: "xp_award",
} as const;

/**
 * BullMQ job names used in badge_evaluation_queue.
 */
export const GAMIFICATION_BADGE_JOBS = {
    BADGE_EVALUATION: "badge_evaluation",
} as const;

/**
 * BullMQ job names used in streak_reset_queue.
 */
export const GAMIFICATION_STREAK_JOBS = {
    /**
     * Repeatable daily job - batch-processes all users whose streak
     * needs evaluation. Payload: {} (no userId - scans all eligible users).
     */
    DAILY_STREAK_RESET: "daily_streak_reset",

    /**
     * Per-user job enqueued by GamificationSubscriber on REEL_WATCH_ENDED.
     * Payload: { userId: string }
     * Updates a single user's streak immediately after they watch a reel.
     */
    UPDATE_USER_STREAK: "update_user_streak",
} as const;

/**
 * BullMQ job names used in leaderboard_reset_queue.
 */
export const GAMIFICATION_LEADERBOARD_JOBS = {
    WEEKLY_LEADERBOARD_RESET: "weekly_leaderboard_reset",
} as const;

// ---------------------------------------------------------------------------
// Redis key prefixes
// ---------------------------------------------------------------------------

/**
 * Redis key prefix constants for the Gamification module.
 *
 * Full key construction:
 *   gamification:badge-lock:{userId}:{badgeCode}
 *   gamification:xp-dedup:{userId}:{source}:{referenceId}
 */
export const GAMIFICATION_REDIS_KEYS = {
    /**
     * Distributed lock to prevent concurrent badge award race conditions.
     * Full key: gamification:badge-lock:{userId}:{badgeCode}
     * TTL: short (10s) - only held during award transaction.
     */
    BADGE_AWARD_LOCK: "gamification:badge-lock",

    /**
     * XP deduplication sentinel. Presence = XP already awarded for this event.
     * Full key: gamification:xp-dedup:{userId}:{source}:{referenceId}
     * TTL: 7 days - covers BullMQ retry window and then some.
     */
    XP_DEDUP: "gamification:xp-dedup",
} as const;

// ---------------------------------------------------------------------------
// Cache TTLs (seconds)
// ---------------------------------------------------------------------------

/**
 * TTL values in seconds for all Gamification module cache entries.
 */
export const GAMIFICATION_CACHE_TTL = {
    /** Badge award distributed lock - 10 seconds. */
    BADGE_AWARD_LOCK: 10,

    /** XP deduplication sentinel - 7 days. */
    XP_DEDUP: 604800,
} as const;

// ---------------------------------------------------------------------------
// Repeatable job schedules (cron expressions, UTC)
// ---------------------------------------------------------------------------

/**
 * Cron pattern for the daily streak reset job.
 * Runs at 00:05 UTC every day (5 minutes after midnight to avoid clock skew).
 */
export const STREAK_RESET_CRON = "5 0 * * *";

/**
 * Cron pattern for the weekly leaderboard reset job.
 * Runs at 00:00 UTC every Monday (day 1 of week in cron = Monday).
 */
export const LEADERBOARD_RESET_CRON = "0 0 * * 1";

// ---------------------------------------------------------------------------
// Batch sizes
// ---------------------------------------------------------------------------

/**
 * Number of users processed per batch in the streak reset worker.
 * Prevents memory pressure on large user tables.
 */
export const STREAK_RESET_BATCH_SIZE = 500;

/**
 * Number of active badge definitions fetched and cached per evaluation run.
 */
export const BADGE_EVALUATION_CACHE_SIZE = 100;

// ---------------------------------------------------------------------------
// Criteria evaluation
// ---------------------------------------------------------------------------

/**
 * All valid criteria type discriminant strings.
 */

export const CRITERIA_TYPES = {
    CHALLENGE_CORRECT_COUNT: "challenge_correct_count",
    ACCURACY_STREAK: "accuracy_streak",
    TOPIC_MASTER: "topic_master",
} as const;

export type CriteriaType = (typeof CRITERIA_TYPES)[keyof typeof CRITERIA_TYPES];

export const BADGE_CRITERIA_TYPES = Object.values(
    CRITERIA_TYPES,
) as CriteriaType[];
