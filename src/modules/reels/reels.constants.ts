/**
 * @module modules/reels/reels.constants
 * @description
 * Shared constants, Redis key prefixes, TTL values, pub/sub channel names,
 * event names, Bloom filter parameters, rate-limit configs, and enum values
 * used across the Reels module.
 */

/**
 * Redis key prefixes used by the Reels module for cache reads and writes.
 */
export const REELS_REDIS_KEYS = {
    /** Hash: full reel metadata. TTL 300s. */
    META_PREFIX: "reel:meta",
    /** Hash: reel draft metadata before upload is confirmed. TTL matches presigned URL window. */
    DRAFT_PREFIX: "reel:draft",
    /** Set: active reel IDs per tag. No TTL - permanent. */
    TAG_SET_PREFIX: "reel_tags:tag",
    /** Bloom filter: watched reel IDs per user. TTL 30 days. */
    WATCHED_PREFIX: "watched",
    /** List: personalised feed reel IDs per user. TTL 1800s. */
    FEED_PREFIX: "feed",
    /** Set: reel IDs that have received view events since last cron sync. No TTL. */
    DIRTY_VIEWS: "reels:dirty:views",
} as const;

/**
 * TTL values in seconds used by Reels caching logic.
 */
export const REELS_CACHE_TTL = {
    /** reel:meta:{reelId} hash - 5 minutes */
    META: 300,
    /** reel:draft:{reelId} - 30 minutes. Matches presigned URL expiry window. */
    DRAFT: 1800,
    /** feed:{userId} list - 30 minutes */
    FEED: 1800,
    /** watched:{userId} bloom filter - 30 days */
    WATCHED: 2592000,
} as const;

/**
 * Pub/Sub event names and channel identifiers published by the Reels module.
 */
export const REELS_MODULE_CONSTANTS = {
    // content_events channel
    /** Published by Media module webhook on processing complete. TODO: do not publish from Reels. */
    REEL_CREATED: "REEL_CREATED",
    /** Published on soft delete. */
    REEL_DELETED: "REEL_DELETED",
    /** Published on admin status change. */
    REEL_STATUS_CHANGED: "REEL_STATUS_CHANGED",

    // user_interactions channel
    REEL_LIKED: "REEL_LIKED",
    REEL_UNLIKED: "REEL_UNLIKED",
    REEL_SAVED: "REEL_SAVED",
    REEL_UNSAVED: "REEL_UNSAVED",

    // video_telemetry channel
    /** Published immediately on watch - DB write and cache side effects are async subscribers. */
    REEL_WATCH_ENDED: "REEL_WATCH_ENDED",

    // feed_events channel
    /** Published when feed cache is running low (remaining <= 15). */
    FEED_LOW: "FEED_LOW",

    // shared_events channel
    /** Published when a reel is shared. */
    REEL_SHARED: "REEL_SHARED",

    // Channel names
    CONTENT_EVENTS: "content_events",
    USER_INTERACTIONS: "user_interactions",
    VIDEO_TELEMETRY: "video_telemetry",
    FEED_EVENTS: "feed_events",
} as const;

/**
 * Bloom filter configuration for the watched:{userId} filter.
 * Redis Stack (redis/redis-stack) required for BF.* commands.
 */
// export const REELS_BLOOM = {
//     /** Acceptable false-positive rate (1%). */
//     ERROR_RATE: 0.01,
//     /** Initial capacity before auto-scaling. */
//     CAPACITY: 10000,
// } as const;

/**
 * Remaining feed slots threshold below which a FEED_LOW event is published.
 */
export const FEED_LOW_THRESHOLD = 15;

/**
 * Per-endpoint rate-limit configurations.
 * Applied via @SetRateLimit() decorator on controller methods.
 */
export const REELS_RATE_LIMITS = {
    INTERACTION: { limit: 60, windowSeconds: 60, scope: "user" as const },
    CREATE: { limit: 5, windowSeconds: 3600, scope: "user" as const },
    CONFIRM: { limit: 5, windowSeconds: 3600, scope: "user" as const },
    UPDATE: { limit: 20, windowSeconds: 3600, scope: "user" as const },
    DELETE: { limit: 10, windowSeconds: 3600, scope: "user" as const },
    REPORT: { limit: 3, windowSeconds: 3600, scope: "user" as const },
    SHARE: { limit: 20, windowSeconds: 3600, scope: "user" as const },
    SEARCH: { limit: 30, windowSeconds: 60, scope: "user" as const },
    FEED: { limit: 60, windowSeconds: 60, scope: "user" as const },
    ME: { limit: 60, windowSeconds: 60, scope: "user" as const },
} as const;

/**
 * Valid report reason values for POST /reels/:id/report.
 */
export const REEL_REPORT_REASON = {
    SPAM: "spam",
    MISLEADING: "misleading",
    INAPPROPRIATE: "inappropriate",
    HATE_SPEECH: "hate_speech",
    ILLEGAL_CONTENT: "illegal_content",
    OTHER: "other",
} as const;

/**
 * Union type of valid report reason strings.
 * Derived from {@link REEL_REPORT_REASON} - never manually maintained.
 */
export type ReelReportReason =
    (typeof REEL_REPORT_REASON)[keyof typeof REEL_REPORT_REASON];

/**
 * Array of valid report reason strings.
 * Use with `@IsEnum(REEL_REPORT_REASONS)` and `@ApiProperty({ enum: REEL_REPORT_REASONS })`.
 */
export const REEL_REPORT_REASONS = Object.values(
    REEL_REPORT_REASON,
) as ReelReportReason[];

/**
 * Valid reel difficulty levels.
 */
export const REEL_DIFFICULTY = {
    BEGINNER: "beginner",
    INTERMEDIATE: "intermediate",
    ADVANCED: "advanced",
} as const;

/**
 * Union type of all valid reel difficulty strings.
 * Derived from {@link REEL_DIFFICULTY}
 */
export type ReelDifficulty =
    (typeof REEL_DIFFICULTY)[keyof typeof REEL_DIFFICULTY];

/**
 * Array of all valid reel difficulty strings.
 * Use with `@IsEnum(REEL_DIFFICULTIES)` and `@ApiProperty({ enum: REEL_DIFFICULTIES })`.
 */
export const REEL_DIFFICULTIES = Object.values(
    REEL_DIFFICULTY,
) as ReelDifficulty[];

/**
 * All possible reel status values.
 */

export const REEL_STATUS = {
    UPLOADING: "uploading",
    PROCESSING: "processing",
    ACTIVE: "active",
    FAILED: "failed",
    NEEDS_REVIEW: "needs_review",
    DISABLED: "disabled",
    DELETED: "deleted",
} as const;

/**
 * Union type of all valid reel status strings.
 * Derived from {@link REEL_STATUS} - never manually maintained.
 */
export type ReelStatus = (typeof REEL_STATUS)[keyof typeof REEL_STATUS];

/**
 * Array of all valid reel status strings.
 * Use with `@IsEnum(REEL_STATUSES)` and `@ApiProperty({ enum: REEL_STATUSES })`.
 */
export const REEL_STATUSES = Object.values(REEL_STATUS) as ReelStatus[];

/**
 * Statuses that permit creator edits (PATCH /reels/:id).
 * processing - MediaConvert job in-flight, mutation would corrupt pipeline.
 * needs_review - under admin review, edits blocked.
 * disabled - admin enforcement, creator cannot self-recover.
 * deleted - soft deleted, no mutations.
 */

export const REEL_EDITABLE_STATUSES = [
    REEL_STATUS.UPLOADING,
    REEL_STATUS.ACTIVE,
    REEL_STATUS.FAILED,
] as const satisfies readonly ReelStatus[];

/**
 * Valid status values that an admin may set via PATCH /reels/:id/status.
 */
export const REEL_ADMIN_STATUS = {
    ACTIVE: "active",
    DISABLED: "disabled",
    NEEDS_REVIEW: "needs_review",
} as const;

/**
 * Union type of admin-settable reel status strings.
 * Derived from {@link REEL_ADMIN_STATUS} - never manually maintained.
 */
export type ReelAdminStatus =
    (typeof REEL_ADMIN_STATUS)[keyof typeof REEL_ADMIN_STATUS];

/**
 * Array of admin-settable reel status strings.
 * Use with `@IsEnum(REEL_ADMIN_STATUSES)` and `@ApiProperty({ enum: REEL_ADMIN_STATUSES })`.
 */
export const REEL_ADMIN_STATUSES = Object.values(
    REEL_ADMIN_STATUS,
) as ReelAdminStatus[];

/**
 * S3 bucket environment variable names used when generating presigned URLs.
 */
export const REELS_S3_ENV = {
    RAW_BUCKET: "S3_RAW_BUCKET",
} as const;

/**
 * Presigned URL expiry in seconds (15 minutes).
 */
export const REELS_PRESIGN_EXPIRES_IN = 900;

/**
 * Maximum raw video upload size in bytes (500 MB).
 */
export const REELS_MAX_UPLOAD_BYTES = 524_288_000;

/**
 * Accepted video MIME type for upload.
 */
export const REELS_ACCEPTED_MIME = "video/mp4" as const;

/** Union type for accepted MIME types. */
export type ReelAcceptedMime = typeof REELS_ACCEPTED_MIME;

/**
 * User-facing success messages returned by Reels endpoints.
 */
export const REELS_MESSAGES = {
    DELETED: "Reel deleted successfully",
    REPORT_SUBMITTED: "Report submitted successfully",
    CONFIRM: "Video uploaded successfully. Processing has begun.",
} as const;

// Queue job names

/**
 * BullMQ job name constants used when adding jobs to queues.
 * Centralised here so queue producers and consumers reference the same strings.
 */
export const REELS_QUEUE_JOBS = {
    /**
     * Job name for the video processing queue.
     * Added by POST /reels/:id/confirm after S3 upload is verified.
     * Consumed by VideoProcessingWorker in the Media module.
     */
    VIDEO_PROCESS: "process",

    /**
     * Job name for the feed build queue on cold cache start.
     * Added by GET /reels/feed when feed:{userId} List is empty.
     * Consumed by FeedBuildWorker in the Feed module.
     */
    FEED_COLD_START: "cold_start",

    /**
     * Job name for the feed build queue triggered by a search action.
     * Signals that the user's search intent should influence feed personalisation.
     */
    FEED_SEARCH: "search",

    /**
     * Job name for the feed build queue triggered by a share action.
     * Signals interest in the shared reel's tag set.
     */
    FEED_SHARE: "share",
} as const;

// Reel meta cache field names

/**
 * Field name constants for the reel:meta:{reelId} Redis Hash.
 * Used with HINCRBY to increment counters without magic strings.
 */
export const REEL_META_FIELD = {
    /** Total number of likes. Incremented on like, decremented on unlike. */
    LIKE_COUNT: "like_count",
    /** Total number of saves. Incremented on save, decremented on unsave. */
    SAVE_COUNT: "save_count",
    /** Total number of views. Incremented by REEL_WATCH_ENDED subscriber. */
    VIEW_COUNT: "view_count",
    /** Total number of shares. Incremented by share endpoint (future). */
    SHARE_COUNT: "share_count",
} as const;

// Distributed locks

/**
 * Redis distributed lock configuration for write operations that must not
 * run concurrently for the same user.
 *
 * Lock implementation uses SET NX EX (set-if-not-exists with TTL).
 * The TTL acts as a safety net - if the server crashes mid-operation the lock
 * auto-expires and never blocks the user permanently.
 *
 * Full key: `{UPLOAD_PREFIX}:{userId}` e.g. `lock:upload:019501a0-…`
 */
export const REELS_LOCKS = {
    /**
     * Key prefix for the per-user upload lock.
     * Acquired at the start of POST /reels, released in the finally block.
     */
    UPLOAD_PREFIX: "lock:upload",

    /**
     * Lock TTL in seconds.
     * Must be long enough to cover the full createReel operation including
     * the S3 presigned URL generation round-trip. 30s is conservative.
     */
    UPLOAD_TTL: 30,
} as const;

/**
 * App-level environment variable names used by the Reels module.
 */
export const REELS_APP_ENV = {
    /** Base URL for shareable reel links. */
    APP_BASE_URL: "APP_BASE_URL",
} as const;
