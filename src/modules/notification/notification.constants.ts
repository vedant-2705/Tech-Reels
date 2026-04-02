/**
 * @module modules/notification/notification.constants
 * @description
 * All shared constants for the Notification module: job types, job names,
 * notification channels, and retry configuration.
 */

/**
 * Notification type strings that identify what kind of notification to send.
 * Used in the type field of notification queue jobs.
 */
export const NOTIFICATION_TYPES = {
    ADMIN_MESSAGE: "admin_message",
    PATH_COMPLETED: "path_completed",
    REEL_LIKED: "reel_liked",
    CHALLENGE_COMPLETED: "challenge_completed",
} as const;

export type NotificationType =
    (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

/**
 * BullMQ queue job names for the notification_queue.
 * The job name identifies the operation/handler to dispatch to.
 */
export const NOTIFICATION_QUEUE_JOBS = {
    /** Generic notification job - type field determines the handler */
    SEND_NOTIFICATION: "send_notification",
} as const;

/**
 * Notification channels - which services to use for sending.
 */
export const NOTIFICATION_CHANNELS = {
    EMAIL: "email",
    PUSH: "push",
    BOTH: "both",
} as const;

export type NotificationChannel =
    (typeof NOTIFICATION_CHANNELS)[keyof typeof NOTIFICATION_CHANNELS];

/**
 * Retry configuration for notification jobs.
 * Notifications are important but not mission-critical.
 */
export const NOTIFICATION_JOB_CONFIG = {
    /** Retry count for failed notification jobs */
    RETRY_ATTEMPTS: 3,
    /** Time in ms to wait before first retry */
    RETRY_BACKOFF_MS: 5000,
} as const;
