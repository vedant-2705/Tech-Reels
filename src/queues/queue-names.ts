/**
 * All BullMQ queue name constants.
 *
 * Rules:
 * - Always use these constants - never hardcode queue name strings.
 * - Queue names match exactly what workers and producers expect.
 * - Adding a new queue: add here, register in QueuesModule, create worker.
 */
export const QUEUES = {
    VIDEO_PROCESSING: "video_processing_queue",
    XP_AWARD: "xp_award_queue",
    BADGE_EVALUATION: "badge_evaluation_queue",
    NOTIFICATION: "notification_queue",
    REPORT_EVALUATION: "report_evaluation_queue",
    FEED_BUILD: "feed_build_queue",
    STREAK_RESET: "streak_reset_queue",
    LEADERBOARD_RESET: "leaderboard_reset_queue",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
