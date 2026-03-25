/**
 * @module modules/challenges/challenges.constants
 * @description
 * All shared constants for the Challenges module: challenge types,
 * difficulties, XP values, attempt limits, pub/sub channels, queue job
 * names, Redis key prefixes, cache TTLs, and idempotency config.
 *
 * Import these constants everywhere - never hardcode strings or numbers.
 */

// ---------------------------------------------------------------------------
// Challenge types
// ---------------------------------------------------------------------------

/**
 * All valid challenge type values.
 * Mirrors the challenge_type DB enum.
 */
export const CHALLENGE_TYPE = {
    MCQ: "mcq",
    CODE_FILL: "code_fill",
    TRUE_FALSE: "true_false",
    OUTPUT_PREDICTION: "output_prediction",
} as const;

/** Union type of all valid challenge type strings. */
export type ChallengeType =
    (typeof CHALLENGE_TYPE)[keyof typeof CHALLENGE_TYPE];

/** Array of all valid challenge type strings. */
export const CHALLENGE_TYPES = Object.values(CHALLENGE_TYPE) as ChallengeType[];

// ---------------------------------------------------------------------------
// Difficulty
// ---------------------------------------------------------------------------

/**
 * All valid challenge difficulty values.
 * Mirrors the difficulty_level DB enum (shared with reels).
 */
export const CHALLENGE_DIFFICULTY = {
    BEGINNER: "beginner",
    INTERMEDIATE: "intermediate",
    ADVANCED: "advanced",
} as const;

/** Union type of all valid challenge difficulty strings. */
export type ChallengeDifficulty =
    (typeof CHALLENGE_DIFFICULTY)[keyof typeof CHALLENGE_DIFFICULTY];

/** Array of all valid challenge difficulty strings. */
export const CHALLENGE_DIFFICULTIES = Object.values(
    CHALLENGE_DIFFICULTY,
) as ChallengeDifficulty[];

// ---------------------------------------------------------------------------
// XP & attempt rules
// ---------------------------------------------------------------------------

/**
 * XP awarded per correct attempt by difficulty.
 * Incorrect attempts always award 0 XP - no penalty.
 */
export const CHALLENGE_XP_REWARD: Record<ChallengeDifficulty, number> = {
    [CHALLENGE_DIFFICULTY.BEGINNER]: 10,
    [CHALLENGE_DIFFICULTY.INTERMEDIATE]: 20,
    [CHALLENGE_DIFFICULTY.ADVANCED]: 30,
} as const;

/**
 * Default maximum number of attempts allowed per challenge per user.
 * The actual per-challenge limit is read from challenges.max_attempts column.
 * This constant documents the platform default only.
 */
export const CHALLENGE_MAX_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// Pub/Sub
// ---------------------------------------------------------------------------

/**
 * Pub/Sub channel used for all gamification events published
 * by the Challenges module.
 */
export const CHALLENGES_PUBSUB_CHANNEL = "gamification_events";

/**
 * Pub/Sub event names published by the Challenges module.
 */
export const CHALLENGES_EVENTS = {
    ATTEMPT_SUBMITTED: "ATTEMPT_SUBMITTED",
} as const;

// ---------------------------------------------------------------------------
// Queue job names
// ---------------------------------------------------------------------------

/**
 * BullMQ queue job names produced by the Challenges module.
 * Centralised here so producers and consumers reference the same strings.
 */
export const CHALLENGES_QUEUE_JOBS = {
    /** Job added to xp_award_queue on a correct attempt. */
    XP_AWARD: "xp_award",

    /** Job added to badge_evaluation_queue on a correct attempt. */
    BADGE_EVALUATION: "badge_evaluation",
} as const;

// ---------------------------------------------------------------------------
// Redis key prefixes
// ---------------------------------------------------------------------------

/**
 * Redis key prefix constants for the Challenges module.
 *
 * Full key construction:
 *   challenges:reel:{reelId}
 *   challenges:id:{challengeId}
 *   challenges:summary:{userId}:{challengeId}
 *   challenges:attempts:{userId}:{challengeId}
 *   challenges:user-attempts:{userId}:{reelId}
 *   challenges:idempotency:{userId}:{idempotencyKey}
 */
export const CHALLENGES_REDIS_KEYS = {
    /**
     * Full challenge list for a reel. Stored with correct_answer included -
     * service strips it before returning to the client. Includes all fields
     * needed by evaluators so submitAttempt can hit cache instead of DB.
     * Full key: challenges:reel:{reelId}
     */
    REEL_CHALLENGES: "challenges:reel",

    /**
     * Single challenge row by primary key. Includes correct_answer and
     * case_sensitive for evaluator use inside submitAttempt.
     * Full key: challenges:id:{challengeId}
     */
    CHALLENGE_BY_ID: "challenges:id",

    /**
     * Attempt summary: { attempt_count, has_correct }.
     * The lock/retry gate in submitAttempt reads this on every attempt.
     * Written (overwritten) immediately after every successful insertAttempt.
     * Full key: challenges:summary:{userId}:{challengeId}
     */
    ATTEMPT_SUMMARY: "challenges:summary",

    /**
     * Full ordered attempt history for a user on a single challenge.
     * Written (overwritten) after every insertAttempt.
     * Read by GET /challenges/:id/attempts/me.
     * Full key: challenges:attempts:{userId}:{challengeId}
     */
    ATTEMPT_HISTORY: "challenges:attempts",

    /**
     * Latest attempt status per challenge for a user scoped to a reel.
     * Used to merge attempt status into GET /reels/:reelId/challenges.
     * Allowed to expire naturally - minor staleness is acceptable.
     * Full key: challenges:user-attempts:{userId}:{reelId}
     */
    USER_REEL_ATTEMPTS: "challenges:user-attempts",

    /**
     * Idempotency cache for POST /challenges/:id/attempt.
     * Value: JSON { requestBodyHash, response: AttemptResultDto }
     * Full key: challenges:idempotency:{userId}:{idempotencyKey}
     */
    IDEMPOTENCY: "challenges:idempotency",
} as const;

// ---------------------------------------------------------------------------
// Cache TTLs (seconds)
// ---------------------------------------------------------------------------

/**
 * TTL values in seconds for all Challenges module cache entries.
 */
export const CHALLENGES_CACHE_TTL = {
    /** challenges:reel:{reelId} - 5 minutes */
    REEL_CHALLENGES: 300,

    /** challenges:id:{challengeId} - 5 minutes */
    CHALLENGE_BY_ID: 300,

    /**
     * challenges:summary:{userId}:{challengeId} - 1 hour.
     * Overwritten after every insertAttempt. TTL is a safety net only.
     */
    ATTEMPT_SUMMARY: 3600,

    /**
     * challenges:attempts:{userId}:{challengeId} - 1 hour.
     * Overwritten after every insertAttempt. TTL is a safety net only.
     */
    ATTEMPT_HISTORY: 3600,

    /**
     * challenges:user-attempts:{userId}:{reelId} - 5 minutes.
     * Allowed to expire naturally - minor staleness acceptable on this path.
     */
    USER_REEL_ATTEMPTS: 300,

    /**
     * challenges:idempotency:{userId}:{idempotencyKey} - 24 hours.
     * Must outlive any reasonable client retry window.
     */
    IDEMPOTENCY: 86400,
} as const;

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

/**
 * HTTP header name the client sends to enable idempotent attempt submission.
 * Value must be a client-generated UUID. Optional - omitting the header
 * disables idempotency protection for that request.
 */
export const IDEMPOTENCY_HEADER = "x-idempotency-key";

// ---------------------------------------------------------------------------
// XP award source & badge event strings
// ---------------------------------------------------------------------------

/**
 * Source identifier strings used in xp_award_queue job payloads.
 * Mirrors the xp_source enum values in the xp_ledger table.
 */
export const CHALLENGES_XP_SOURCE = {
    CHALLENGE_CORRECT: "challenge_correct",
} as const;

/**
 * Event strings used in badge_evaluation_queue job payloads.
 */
export const CHALLENGES_BADGE_EVENTS = {
    CHALLENGE_CORRECT: "challenge_correct",
} as const;

// ---------------------------------------------------------------------------
// Business rules
// ---------------------------------------------------------------------------

/**
 * Maximum number of challenges allowed per reel.
 * Enforced on POST /reels/:reelId/challenges.
 */
export const CHALLENGE_MAX_PER_REEL = 3;

/**
 * Challenge types that require an options[] array in the request payload.
 *   mcq        -> exactly 4 options
 *   true_false -> exactly 2 options
 * code_fill and output_prediction must have options: null / omitted.
 */
export const CHALLENGE_TYPES_REQUIRING_OPTIONS: ReadonlySet<ChallengeType> =
    new Set([CHALLENGE_TYPE.MCQ, CHALLENGE_TYPE.TRUE_FALSE]);

/**
 * Required options[] length per challenge type.
 */
export const CHALLENGE_OPTIONS_COUNT: Partial<Record<ChallengeType, number>> = {
    [CHALLENGE_TYPE.MCQ]: 4,
    [CHALLENGE_TYPE.TRUE_FALSE]: 2,
} as const;


/** Default token reward per challenge (platform default). */
export const CHALLENGE_DEFAULT_TOKEN_REWARD  = 2;

/** Default max attempts per challenge (platform default). */
export const CHALLENGE_DEFAULT_MAX_ATTEMPTS  = 3;