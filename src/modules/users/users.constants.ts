/**
 * @module modules/users/users.constants
 * @description
 * Shared constants, Redis key prefixes, queue job names, user-facing
 * messages, Pub/Sub channel identifiers, and rate-limit configurations
 * used by the users module.
 */

/**
 * Redis key prefixes used by users caching.
 */
export const USERS_REDIS_KEYS = {
    AVATAR_PENDING_PREFIX: "avatar_pending",
    FEED_QUEUE_PREFIX: "feed_queue",
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
    TRANSACTIONAL_CHANNEL: "transactional",
} as const;

/**
 * Rate-limit configurations for users endpoints.
 * Applied via @SetRateLimit() + @UseGuards(RateLimitGuard).
 */

export enum RateLimitScopeEnum {
    USER = "user",
    IP = "ip"
}

export interface RateLimitConfig {
    limit: number;
    windowSeconds: number;
    scope: RateLimitScopeEnum;
}

export type UsersRateLimits = Record<string, RateLimitConfig>;

export const USERS_RATE_LIMITS: UsersRateLimits = {
    PROFILE_UPDATE: { limit: 10, windowSeconds: 3600, scope: RateLimitScopeEnum.USER },
    ONBOARDING: { limit: 5, windowSeconds: 3600, scope: RateLimitScopeEnum.USER },
    AVATAR: { limit: 5, windowSeconds: 3600, scope: RateLimitScopeEnum.USER },
    DEACTIVATE: { limit: 3, windowSeconds: 3600, scope: RateLimitScopeEnum.USER },
    PUBLIC_TOKEN: { limit: 5, windowSeconds: 3600, scope: RateLimitScopeEnum.USER },
    PUBLIC_PROFILE: { limit: 30, windowSeconds: 3600, scope: RateLimitScopeEnum.IP },
} as const;

/**
 * Account status values for users. Used to gate access to authentication and profile retrieval for deactivated accounts, and to mark accounts as deactivated
 * when users choose to deactivate.
 */
export const USERS_ACCOUNT_STATUSES = {
    ACTIVE: "active",
    DEACTIVATED: "deactivated",
} as const;