/**
 * @module modules/users/users.constants
 * @description
 * Shared constants, Redis key prefixes, queue job names, user-facing
 * messages, Pub/Sub channel identifiers, and rate-limit configurations
 * used by the users module.
 */

import { PUBSUB_TRANSACTIONAL } from "@common/constants/redis-keys.constants";

/**
 * Redis key prefixes used by users caching.
 */
export const USERS_REDIS_KEYS = {
    AVATAR_PENDING_PREFIX: "avatar_pending",
    FEED_QUEUE_PREFIX: "feed_queue",
    TOP_TAGS_PREFIX: "top_tags",
    LEADERBOARD_PREFIX: "leaderboard:weekly",
} as const;

/**
 * TTL values (in seconds) for users-related cache entries. Used when setting cache entries in Redis, and for consistent cache invalidation logic across the module.
*/
export const USERS_CACHE_TTL_SECONDS = {
    USER_PROFILE: 3600, 
    TOP_TAGS_TTL: 3600,
    PENDING_AVATAR: 600,
} as const;

/**
 * Queue job names emitted by users workflows.
 */
export const USERS_QUEUE_JOBS = {
    REBUILD_FEED: "rebuild",
    NEW_USER: "new_user",
} as const;

/**
 * User-facing success messages returned by users endpoints.
 */
export const USERS_MESSAGES = {
    ONBOARDING_COMPLETE: "Onboarding complete",
    ACCOUNT_DEACTIVATED: "Account deactivated successfully",
    TOKEN_REVOKED: "Public profile token revoked",
} as const;

/**
 * Users module event names and shared Pub/Sub channel identifiers.
 */

export const USERS_MODULE_CONSTANTS = {
    ACCOUNT_DEACTIVATED: "ACCOUNT_DEACTIVATED",
    TRANSACTIONAL_CHANNEL: PUBSUB_TRANSACTIONAL,
} as const;

/**
 * Rate-limit configurations for users endpoints.
 * Applied via @SetRateLimit() + @UseGuards(RateLimitGuard).
 */
export const USERS_RATE_LIMITS = {
    PROFILE_UPDATE: { limit: 10, windowSeconds: 3600, scope: "user" as const },
    ONBOARDING: { limit: 5, windowSeconds: 3600, scope: "user" as const },
    AVATAR: { limit: 5, windowSeconds: 3600, scope: "user" as const },
    DEACTIVATE: { limit: 3, windowSeconds: 3600, scope: "user" as const },
    PUBLIC_TOKEN: { limit: 5, windowSeconds: 3600, scope: "user" as const },
    PUBLIC_PROFILE: { limit: 30, windowSeconds: 3600, scope: "ip" as const },
    LEADERBOARD: { limit: 60, windowSeconds: 3600, scope: "user" as const },
} as const;

/**
 * Account status values for users. Used to gate access to authentication and profile retrieval for deactivated accounts, and to mark accounts as deactivated
 * when users choose to deactivate.
 */
export const USERS_ACCOUNT_STATUSES = {
    ACTIVE: "active",
    DEACTIVATED: "deactivated",
} as const;
