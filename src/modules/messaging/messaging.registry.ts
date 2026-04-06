import { QUEUES } from "src/queues/queue-names";
import {
    AUTH,
    CHALLENGES_QUEUE_JOBS,
    FEED_EVENTS,
    GAMIFICATION_EVENTS,
    GAMIFICATION_QUEUE_JOBS,
    NOTIFICATION_QUEUE_JOBS,
    REDIS_CHANNELS,
    REELS_QUEUE_JOBS,
    SKILL_PATH_QUEUE_JOBS,
    USER_INTERACTION_EVENTS,
    USERS_QUEUE_JOBS,
    VIDEO_TELEMETRY_EVENTS,
} from "./messaging.constants";

// ---------------------------------------------------------------------------
// JOB -> QUEUE REGISTRY
//
// Single source of truth: job name string -> physical queue name.
//
// Rules:
//   - Key:   exact string value from a *_QUEUE_JOBS constant
//             (must match what queue.add(jobName) receives)
//   - Value: physical queue name from QUEUES
//
// To add a new job type:
//   1. Add the queue to QueuesModule (if it doesn't exist)
//   2. Add one line here
//   MessagingService and all callers stay untouched.
// ---------------------------------------------------------------------------

export const JOB_QUEUE_REGISTRY: Readonly<Record<string, string>> = {
    // Auth
    [AUTH.QUEUE_JOBS.WELCOME_EMAIL]: QUEUES.NOTIFICATION,
    [AUTH.QUEUE_JOBS.NEW_USER]: QUEUES.FEED_BUILD,

    // Users
    [USERS_QUEUE_JOBS.REBUILD]: QUEUES.FEED_BUILD,

    // Reels
    [REELS_QUEUE_JOBS.FEED_COLD_START]: QUEUES.FEED_BUILD,
    [REELS_QUEUE_JOBS.PROCESS_VIDEO]: QUEUES.VIDEO_PROCESSING,

    // Gamification (owns the canonical xp_award and badge_evaluation strings)
    [GAMIFICATION_QUEUE_JOBS.XP_AWARD]: QUEUES.XP_AWARD,
    [GAMIFICATION_QUEUE_JOBS.BADGE_EVALUATION]: QUEUES.BADGE_EVALUATION,
    [GAMIFICATION_QUEUE_JOBS.WEEKLY_LEADERBOARD_RESET]:
        QUEUES.LEADERBOARD_RESET,
    [GAMIFICATION_QUEUE_JOBS.STREAK_RESET]: QUEUES.STREAK_RESET,
    [GAMIFICATION_QUEUE_JOBS.UPDATE_USER_STREAK]: QUEUES.STREAK_RESET,

    // Skill Paths (namespaced strings - different callers, same target queues)
    [SKILL_PATH_QUEUE_JOBS.XP_AWARD]: QUEUES.XP_AWARD,
    [SKILL_PATH_QUEUE_JOBS.BADGE_EVALUATION]: QUEUES.BADGE_EVALUATION,
    [SKILL_PATH_QUEUE_JOBS.NOTIFICATION]: QUEUES.NOTIFICATION,

    // Challenges (namespaced strings)
    [CHALLENGES_QUEUE_JOBS.XP_AWARD]: QUEUES.XP_AWARD,
    [CHALLENGES_QUEUE_JOBS.BADGE_EVALUATION]: QUEUES.BADGE_EVALUATION,

    // Notifications
    [NOTIFICATION_QUEUE_JOBS.SEND_NOTIFICATION]: QUEUES.NOTIFICATION,
} as const;

// ---------------------------------------------------------------------------
// EVENT -> CHANNEL REGISTRY
//
// Single source of truth: event type string -> physical Redis channel.
//
// Rules:
//   - Key:   exact string value from a *_EVENTS constant
//   - Value: physical channel name from REDIS_CHANNELS
//
// To add a new event type: add one line here. Nothing else changes.
// ---------------------------------------------------------------------------

export const EVENT_CHANNEL_REGISTRY: Readonly<Record<string, string>> = {
    // Feed & Content
    [FEED_EVENTS.FEED_LOW]: REDIS_CHANNELS.FEED_EVENTS,
    [FEED_EVENTS.CONTENT_EVENT]: REDIS_CHANNELS.CONTENT_EVENTS,
    [FEED_EVENTS.REEL_DELETED]: REDIS_CHANNELS.CONTENT_EVENTS,
    [FEED_EVENTS.REEL_STATUS_CHANGED]: REDIS_CHANNELS.CONTENT_EVENTS,
    [FEED_EVENTS.TAG_UPDATED]: REDIS_CHANNELS.CONTENT_EVENTS,

    // Video Telemetry
    [VIDEO_TELEMETRY_EVENTS.REEL_WATCH_ENDED]: REDIS_CHANNELS.VIDEO_TELEMETRY,

    // User Interactions
    [USER_INTERACTION_EVENTS.REEL_LIKED]: REDIS_CHANNELS.USER_INTERACTIONS,
    [USER_INTERACTION_EVENTS.REEL_UNLIKED]: REDIS_CHANNELS.USER_INTERACTIONS,
    [USER_INTERACTION_EVENTS.REEL_SAVED]: REDIS_CHANNELS.USER_INTERACTIONS,
    [USER_INTERACTION_EVENTS.REEL_UNSAVED]: REDIS_CHANNELS.USER_INTERACTIONS,
    [USER_INTERACTION_EVENTS.REEL_SHARED]: REDIS_CHANNELS.USER_INTERACTIONS,

    // Gamification
    [GAMIFICATION_EVENTS.XP_AWARDED]: REDIS_CHANNELS.GAMIFICATION_EVENTS,
    [GAMIFICATION_EVENTS.BADGE_EARNED]: REDIS_CHANNELS.GAMIFICATION_EVENTS,
    [GAMIFICATION_EVENTS.PATH_COMPLETED]: REDIS_CHANNELS.GAMIFICATION_EVENTS,
    [GAMIFICATION_EVENTS.ATTEMPT_SUBMITTED]: REDIS_CHANNELS.GAMIFICATION_EVENTS,
    [GAMIFICATION_EVENTS.CHALLENGE_CORRECT]: REDIS_CHANNELS.GAMIFICATION_EVENTS,
} as const;
