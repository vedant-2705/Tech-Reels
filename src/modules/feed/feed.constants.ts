/**
 * @module modules/feed/feed.constants
 * @description
 * Shared constants, Redis key prefixes, TTL values, scoring weights,
 * affinity deltas, difficulty preference multipliers, pub/sub channel
 * names, event names, and job reason values used across the Feed module.
 */

// ---------------------------------------------------------------------------
// Redis keys
// ---------------------------------------------------------------------------

/**
 * Redis key prefixes used by the Feed module for cache reads and writes.
 * FEED_PREFIX and WATCHED_PREFIX intentionally mirror REELS_REDIS_KEYS -
 * Feed module owns writes to feed:{userId}, Reels module reads from it.
 */
export const FEED_REDIS_KEYS = {
    /** List: personalised feed reel IDs per user. TTL 1800s. Feed module writes, Reels reads. */
    FEED_PREFIX: "feed",
    /** Sorted Set: trending reel IDs scored by 24h view count. TTL 900s. */
    TRENDING: "trending:reels",
    /** Bloom filter: watched reel IDs per user. Feed module reads, Reels writes. */
    WATCHED_PREFIX: "watched",
    /** Set: active reel IDs per tag. Feed module reads, Reels writes. */
    TAG_SET_PREFIX: "reel_tags:tag",
} as const;

// ---------------------------------------------------------------------------
// TTL values
// ---------------------------------------------------------------------------

/**
 * TTL in seconds for feed:{userId} Redis List.
 * 30 minutes - matches presigned URL window used elsewhere in the system.
 */
export const FEED_TTL = 1800;

/**
 * TTL in seconds for trending:reels Sorted Set.
 * 15 minutes - cron runs every 15 minutes so this prevents stale data serving.
 */
export const TRENDING_TTL = 900;

// ---------------------------------------------------------------------------
// Sizing limits
// ---------------------------------------------------------------------------

/**
 * Number of reels pushed per feed build cycle.
 */
export const FEED_TARGET_SIZE = 50;

/**
 * Maximum number of trending candidate IDs read from the sorted set.
 */
export const TRENDING_CANDIDATE_LIMIT = 50;

/**
 * Top N tags by affinity score used for candidate generation (Source A).
 */
export const AFFINITY_TAG_LIMIT = 10;

/**
 * Maximum number of reel IDs retained in the feed:{userId} List after
 * LTRIM on each replenish cycle. Prevents unbounded list growth.
 */
export const FEED_MAX_LIST_SIZE = 200;

/**
 * Remaining feed slots threshold below which a FEED_BUILD job is enqueued.
 * Mirrors FEED_LOW_THRESHOLD in reels.constants - Feed module owns the rebuild.
 */
export const FEED_REPLENISH_THRESHOLD = 15;

/**
 * Minimum fraction of candidates that must come from non-top-3-affinity tags.
 * Enforced in FeedBuilderService to prevent affinity monoculture.
 * 0.20 = at least 20% of FEED_TARGET_SIZE (min 4 of 20) from diverse tags.
 */
export const FEED_DIVERSITY_FLOOR = 0.2;

/**
 * Number of top affinity tags excluded from diversity floor calculation.
 * Reels from tags outside this set count toward the diversity floor.
 */
export const FEED_DIVERSITY_EXCLUDE_TOP_N = 3;

/**
 * Number of reels to pre-populate in reel:meta cache after each build.
 * Matches the default feed page size so the first request is fully cache-hit.
 */
export const FEED_PRECACHE_SIZE = 10;
 
/**
 * TTL for pre-cached reel meta entries in seconds.
 * Mirrors REELS_CACHE_TTL.META = 300s.
 */
export const REEL_META_CACHE_TTL = 300;
 
/**
 * Redis key prefix for reel meta hash.
 * Mirrors REELS_REDIS_KEYS.META_PREFIX - must stay in sync.
 */
export const REEL_META_PREFIX = "reel:meta";

// ---------------------------------------------------------------------------
// Scoring weights
// All weights must sum to 1.0.
// ---------------------------------------------------------------------------

/**
 * Weights applied to each scoring signal in ReelScorerService.
 */
export const FEED_SCORING_WEIGHTS = {
    /** Weight for user–tag affinity score sum. */
    AFFINITY: 0.35,
    /** Weight for average watch completion rate. */
    COMPLETION_RATE: 0.25,
    /** Weight for save rate (saves / views). */
    SAVE_RATE: 0.2,
    /** Weight for like rate (likes / views). */
    LIKE_RATE: 0.1,
    /** Weight for recency decay signal. */
    RECENCY: 0.1,
} as const;

// ---------------------------------------------------------------------------
// Difficulty preference multipliers
// Applied as a final multiplier on the raw score.
// ---------------------------------------------------------------------------

/**
 * Soft-match multipliers applied per (userLevel, reelDifficulty) pair.
 * A novice user seeing a beginner reel gets full score (1.0).
 * A novice user seeing an advanced reel is penalised (0.2).
 */
export const DIFFICULTY_PREFERENCE = {
    novice: {
        beginner: 1.0,
        intermediate: 0.6,
        advanced: 0.2,
    },
    intermediate: {
        beginner: 0.5,
        intermediate: 1.0,
        advanced: 0.7,
    },
    advanced: {
        beginner: 0.2,
        intermediate: 0.7,
        advanced: 1.0,
    },
} as const;

/**
 * Union type of valid user experience level strings.
 * Mirrors the CHECK constraint on users.experience_level.
 */
export type UserExperienceLevel = keyof typeof DIFFICULTY_PREFERENCE;

/**
 * Array of valid user experience level strings.
 */
export const USER_EXPERIENCE_LEVELS = Object.keys(
    DIFFICULTY_PREFERENCE,
) as UserExperienceLevel[];

// ---------------------------------------------------------------------------
// Affinity score bounds
// ---------------------------------------------------------------------------

/**
 * Minimum affinity score. Enforced via GREATEST() in upsertAffinityDelta.
 */
export const AFFINITY_SCORE_MIN = 0.0;

/**
 * Maximum affinity score. Enforced via LEAST() in upsertAffinityDelta.
 */
export const AFFINITY_SCORE_MAX = 10.0;

// ---------------------------------------------------------------------------
// Affinity score deltas
// Applied per interaction event in AffinityUpdateWorker.
// ---------------------------------------------------------------------------

/**
 * Score deltas applied to user_topic_affinity per interaction type.
 * Watch deltas are tiered by completion percentage.
 */
export const AFFINITY_DELTAS = {
    /** Watch with completion >= 80%. Strong positive signal. */
    WATCH_HIGH: 0.5,
    /** Watch with completion 50–79%. Mild positive signal. */
    WATCH_MID: 0.2,
    /** Watch with completion < 50%. Mild negative signal - user skipped. */
    WATCH_LOW: -0.1,
    /** Explicit like - strong positive signal. */
    LIKE: 1.0,
    /** Explicit unlike - reverses the like signal. */
    UNLIKE: -1.0,
    /** Save - strongest positive signal, indicates intent to revisit. */
    SAVE: 1.5,
    /** Unsave - reverses the save signal. */
    UNSAVE: -1.5,
    /** Share - strong positive signal, indicates external endorsement. */
    SHARE: 1.0,
} as const;

/**
 * Completion percentage thresholds for watch affinity delta tiers.
 */
export const WATCH_COMPLETION_THRESHOLDS = {
    /** completion_pct >= this value → WATCH_HIGH delta. */
    HIGH: 80,
    /** completion_pct >= this value (and < HIGH) → WATCH_MID delta. */
    MID: 50,
    /** completion_pct < MID → WATCH_LOW delta. */
} as const;

// ---------------------------------------------------------------------------
// Affinity decay
// ---------------------------------------------------------------------------

/**
 * Multiplier applied to all affinity scores by the weekly decay cron.
 * 0.95 = 5% decay per week. Keeps the feed fresh as user interests shift.
 */
export const AFFINITY_DECAY_MULTIPLIER = 0.95;

// ---------------------------------------------------------------------------
// Pub/Sub channels and event names
// ---------------------------------------------------------------------------

/**
 * Channel names and event name constants used by FeedInteractionsSubscriber
 * and affinity handlers. Channel names are shared with the Reels module -
 * Feed module subscribes, never publishes to these channels.
 */
export const FEED_MODULE_CONSTANTS = {
    // Channels subscribed to by FeedInteractionsSubscriber
    USER_INTERACTIONS: "user_interactions",
    VIDEO_TELEMETRY: "video_telemetry",
    FEED_EVENTS: "feed_events",

    // Events on user_interactions channel
    REEL_LIKED: "REEL_LIKED",
    REEL_UNLIKED: "REEL_UNLIKED",
    REEL_SAVED: "REEL_SAVED",
    REEL_UNSAVED: "REEL_UNSAVED",
    REEL_SHARED: "REEL_SHARED",

    // Events on video_telemetry channel
    REEL_WATCH_ENDED: "REEL_WATCH_ENDED",

    // Events on feed_events channel
    FEED_LOW: "FEED_LOW",
} as const;

// ---------------------------------------------------------------------------
// Job reason constants
// Passed as the `reason` field in FEED_BUILD and AFFINITY_UPDATE job payloads.
// ---------------------------------------------------------------------------

/**
 * Reason strings attached to FEED_BUILD queue jobs.
 * Used for observability and potential reason-specific logging.
 */
export const FEED_JOB_REASONS = {
    /** Feed build triggered during user onboarding. */
    NEW_USER: "new_user",
    /** Feed build triggered when feed cache was empty on GET /reels/feed. */
    COLD_START: "cold_start",
    /** Feed build triggered when feed list dropped below replenish threshold. */
    FEED_LOW: "feed_low",
    /** Feed build triggered by a user search action. */
    SEARCH: "search",
    /** Feed build triggered by a user share action. */
    SHARE: "share",
} as const;

/**
 * Union type of valid feed job reason strings.
 */
export type FeedJobReason =
    (typeof FEED_JOB_REASONS)[keyof typeof FEED_JOB_REASONS];

/**
 * Array of valid feed job reason strings.
 */
export const FEED_JOB_REASON_VALUES = Object.values(
    FEED_JOB_REASONS,
) as FeedJobReason[];
