/**
 * @module modules/skill-paths/skill-paths.constants
 * @description
 * All shared constants for the Skill Paths module: status enums, difficulty,
 * completion thresholds, XP values, queue job names, pub/sub channels,
 * Redis key prefixes, cache TTLs, rate limits, and business rules.
 *
 * Import these constants everywhere - never hardcode strings or numbers.
 */

import { PUBSUB_VIDEO_TELEMETRY } from "@common/constants/redis-keys.constants";

// ---------------------------------------------------------------------------
// Enrolment status
// ---------------------------------------------------------------------------

/**
 * All valid user_skill_paths.status values.
 * Mirrors the user_skill_path_status DB enum created in migration 009.
 */
export const SKILL_PATH_STATUS = {
    IN_PROGRESS: "in_progress",
    COMPLETED: "completed",
} as const;

/** Union type of all valid enrolment status strings. */
export type SkillPathStatus =
    (typeof SKILL_PATH_STATUS)[keyof typeof SKILL_PATH_STATUS];

// ---------------------------------------------------------------------------
// Difficulty
// ---------------------------------------------------------------------------

/**
 * All valid skill path difficulty values.
 * Mirrors the difficulty_level DB enum (shared with reels and challenges).
 */
export const SKILL_PATH_DIFFICULTY = {
    BEGINNER: "beginner",
    INTERMEDIATE: "intermediate",
    ADVANCED: "advanced",
} as const;

/** Union type of all valid skill path difficulty strings. */
export type SkillPathDifficulty =
    (typeof SKILL_PATH_DIFFICULTY)[keyof typeof SKILL_PATH_DIFFICULTY];

/** Array of all valid difficulty strings for DTO validation. */
export const SKILL_PATH_DIFFICULTIES = Object.values(
    SKILL_PATH_DIFFICULTY,
) as SkillPathDifficulty[];

// ---------------------------------------------------------------------------
// Progress / completion rules
// ---------------------------------------------------------------------------

/**
 * Minimum watch completion percentage for a reel to count as completed
 * within a skill path. Events with completion_pct below this are ignored
 * by the VideoTelemetrySubscriber.
 */
export const SKILL_PATH_MIN_COMPLETION_PCT = 80;

/**
 * XP awarded on path completion.
 * Matches the 'path_completed' source in the xp_source DB enum.
 * Only awarded on the FIRST completion (see SKILL_PATH_AWARD_ON_FIRST_COMPLETION_ONLY).
 */
export const SKILL_PATH_COMPLETION_XP = 100;

/**
 * XP and badge queue jobs are only pushed on the first completion.
 * If a user re-enrols and completes the path again, they do NOT receive
 * XP or badges again. The notification job is always sent regardless.
 *
 * Enforcement: isFirstCompletion = completed_at was null before the update.
 */
export const SKILL_PATH_AWARD_ON_FIRST_COMPLETION_ONLY = true;

/**
 * Minimum number of reels required to create a skill path.
 * A path with fewer reels is not meaningful as a curriculum.
 */
export const SKILL_PATH_MIN_REELS = 3;

/**
 * Maximum number of reels allowed in a single skill path.
 */
export const SKILL_PATH_MAX_REELS = 50;

// ---------------------------------------------------------------------------
// Pub/Sub
// ---------------------------------------------------------------------------

/**
 * Pub/Sub channel and event name constants for the Skill Paths module.
 *
 * SUBSCRIBE_CHANNEL: the VideoTelemetrySubscriber listens here for watch events.
 * PUBLISH_CHANNEL:   PATH_COMPLETED is published here for downstream consumers
 *                    (gamification, analytics). Badge/XP are handled via queues,
 *                    not this channel - the publish is for any future module.
 */
export const SKILL_PATH_PUBSUB = {
    SUBSCRIBE_CHANNEL: PUBSUB_VIDEO_TELEMETRY,
    PUBLISH_CHANNEL: "gamification_events",
    EVENTS: {
        REEL_WATCH_ENDED: "REEL_WATCH_ENDED",
        PATH_COMPLETED: "PATH_COMPLETED",
    },
} as const;

// ---------------------------------------------------------------------------
// Queue job names
// ---------------------------------------------------------------------------

/**
 * BullMQ queue job names produced by the Skill Paths module.
 * These are the job name strings passed to queue.add() - distinct from
 * the queue name constants in src/queues/queue-names.ts.
 */
export const SKILL_PATH_QUEUE_JOBS = {
    /** Job added to xp_award_queue on first path completion. */
    XP_AWARD: "xp_award",

    /** Job added to badge_evaluation_queue on first path completion. */
    BADGE_EVALUATION: "badge_evaluation",

    /** Job added to notification_queue on every path completion (first or re-completion). */
    NOTIFICATION: "path_completed",
} as const;

/**
 * XP source identifier for path completion awards.
 * Must match the xp_source enum value in the xp_ledger table.
 */
export const SKILL_PATH_XP_SOURCE = "path_completed" as const;

// ---------------------------------------------------------------------------
// Redis key prefixes
// ---------------------------------------------------------------------------

/**
 * Redis key prefix constants for the Skill Paths module.
 *
 * Full key construction:
 *   skill-paths:list:{difficulty|all}    - paginated published path list
 *   skill-paths:id:{pathId}              - single path detail (no user data)
 *   skill-paths:enrolments:{userId}      - all enrolments for a user
 */
export const SKILL_PATH_REDIS_KEYS = {
    /**
     * Published paths list, optionally filtered by difficulty.
     * Keyed by difficulty value or 'all' when no filter applied.
     * Full key: skill-paths:list:{difficulty|all}
     */
    PATH_LIST: "skill-paths:list",

    /**
     * Single path detail row (no user-specific data - enrolment merged in service).
     * Full key: skill-paths:id:{pathId}
     */
    PATH_BY_ID: "skill-paths:id",

    /**
     * All enrolment rows for a user (joined with path title/difficulty/total_reels).
     * Short TTL because enrolment state changes frequently.
     * Full key: skill-paths:enrolments:{userId}
     */
    ENROLMENTS: "skill-paths:enrolments",
} as const;

// ---------------------------------------------------------------------------
// Cache TTLs (seconds)
// ---------------------------------------------------------------------------

/**
 * TTL values in seconds for all Skill Paths module cache entries.
 */
export const SKILL_PATH_CACHE_TTL = {
    /** skill-paths:list:{difficulty|all} - 5 minutes */
    PATH_LIST: 300,

    /** skill-paths:id:{pathId} - 5 minutes */
    PATH_BY_ID: 300,

    /**
     * skill-paths:enrolments:{userId} - 60 seconds.
     * Short TTL: enrolments change on enrol/unenrol/progress completion.
     * Invalidated explicitly on all write operations; TTL is a safety net.
     */
    ENROLMENTS: 60,
} as const;

// ---------------------------------------------------------------------------
// Rate limits
// ---------------------------------------------------------------------------

/**
 * Per-endpoint rate-limit configurations.
 * Applied via @SetRateLimit() decorator on controller methods.
 */
export const SKILL_PATH_RATE_LIMITS = {
    ENROL: { limit: 20, windowSeconds: 3600, scope: "user" as const },
    UNENROL: { limit: 10, windowSeconds: 3600, scope: "user" as const },
    ADMIN_WRITE: { limit: 20, windowSeconds: 3600, scope: "user" as const },
} as const;

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/**
 * User-facing success message strings returned by Skill Paths endpoints.
 */
export const SKILL_PATH_MESSAGES = {
    ENROLLED: "Enrolled successfully",
    UNENROLLED: "Unenrolled successfully",
    DELETED: "Skill path deleted successfully",
} as const;
