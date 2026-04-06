import { JobsOptions } from "bullmq";

// ---------------------------------------------------------------------------
// BullMQ Job Names
//
// These MUST match the job.name strings your workers switch on.
// Each domain gets its own const object - but the string values are kept
// exactly as your existing workers expect them (no arbitrary namespacing).
//
// Collision rule: if two domains share a string (e.g. both have 'xp_award'),
// they are intentionally separate const objects so callers import the right
// one, but the physical string routes to the correct queue via the registry.
// ---------------------------------------------------------------------------

export const AUTH = {
    QUEUE_JOBS: {
        WELCOME_EMAIL: "welcome_email",
        NEW_USER: "new_user",
    },
    EVENTS: {
        USER_REGISTERED: "USER_REGISTERED",
        USER_LOGGED_IN: "USER_LOGGED_IN",
        USER_LOGGED_OUT: "USER_LOGGED_OUT",
    }

}

export const USERS_QUEUE_JOBS = {
    REBUILD: "rebuild",
} as const;

export const REELS_QUEUE_JOBS = {
    FEED_COLD_START: "feed_cold_start",
    PROCESS_VIDEO: "process_video",
} as const;

export const SKILL_PATH_QUEUE_JOBS = {
    XP_AWARD: "skill_path:xp_award", // namespaced - distinct queue target from gamification
    BADGE_EVALUATION: "skill_path:badge_evaluation",
    NOTIFICATION: "skill_path:notification",
} as const;

export const CHALLENGES_QUEUE_JOBS = {
    XP_AWARD: "challenges:xp_award", // namespaced - same reason
    BADGE_EVALUATION: "challenges:badge_evaluation",
} as const;

export const GAMIFICATION_QUEUE_JOBS = {
    XP_AWARD: "xp_award",
    BADGE_EVALUATION: "badge_evaluation", 
    WEEKLY_LEADERBOARD_RESET: "weekly_leaderboard_reset",
    STREAK_RESET: "streak_reset",
    UPDATE_USER_STREAK: "update_user_streak", 
} as const;

export const NOTIFICATION_QUEUE_JOBS = {
    SEND_NOTIFICATION: "send_notification",
} as const;

// ---------------------------------------------------------------------------
// Redis Pub/Sub Channels
// Physical channel names. Only the registry maps events to these.
// ---------------------------------------------------------------------------

export const REDIS_CHANNELS = {
    CONTENT_EVENTS: "content_events",
    USER_INTERACTIONS: "user_interactions",
    VIDEO_TELEMETRY: "video_telemetry",
    FEED_EVENTS: "feed_events",
    TRANSACTIONAL: "transactional",
    GAMIFICATION_EVENTS: "gamification_events",
} as const;

// ---------------------------------------------------------------------------
// Pub/Sub Event Type Strings
// Embedded in AppMessage.type - what subscribers switch on.
// ---------------------------------------------------------------------------

export const FEED_EVENTS = {
    FEED_LOW: "FEED_LOW",
    CONTENT_EVENT: "CONTENT_EVENT",
    REEL_DELETED: "REEL_DELETED",
    REEL_STATUS_CHANGED: "REEL_STATUS_CHANGED",
    TAG_UPDATED: "TAG_UPDATED",
} as const;

export const VIDEO_TELEMETRY_EVENTS = {
    REEL_WATCH_ENDED: "REEL_WATCH_ENDED",
} as const;

export const USER_INTERACTION_EVENTS = {
    REEL_LIKED: "REEL_LIKED",
    REEL_UNLIKED: "REEL_UNLIKED",
    REEL_SAVED: "REEL_SAVED",
    REEL_UNSAVED: "REEL_UNSAVED",
    REEL_SHARED: "REEL_SHARED",
} as const;

export const GAMIFICATION_EVENTS = {
    XP_AWARDED: "XP_AWARDED",
    BADGE_EARNED: "BADGE_EARNED",
    PATH_COMPLETED: "PATH_COMPLETED",
    ATTEMPT_SUBMITTED: "ATTEMPT_SUBMITTED",
    CHALLENGE_CORRECT: "CHALLENGE_CORRECT",
} as const;

// ---------------------------------------------------------------------------
// Default BullMQ Job Options
// Baseline for every queue.add() call. Callers may override per-dispatch.
// ---------------------------------------------------------------------------

export const DEFAULT_JOB_OPTIONS: Readonly<JobsOptions> = {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: true,
    removeOnFail: 1000,
} as const;
