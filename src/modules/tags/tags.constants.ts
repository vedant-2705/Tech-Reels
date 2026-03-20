/**
 * @module modules/tags/tags.constants
 * @description
 * Shared constants, Redis key prefixes, cache TTL values, Pub/Sub channel
 * identifiers, rate-limit configurations, and the canonical TAG_CATEGORIES
 * array used by the Tags module.
 *
 * TAG_CATEGORIES is the single source of truth for valid tag categories.
 * DTOs import from here - never hardcode the list elsewhere.
 * Adding a new category requires only updating this file; no migration needed.
 */

/**
 * Redis key constants used by the tags cache layer.
 */
export const TAGS_REDIS_KEYS = {
    /** Cache key for the full tag catalogue (no category filter). */
    ALL: "tags:all",
    /** Prefix for per-category cache keys. Append `:${category}` to build the full key. */
    CATEGORY_PREFIX: "tags:category",
} as const;

/**
 * Cache TTL values in seconds used by the tags module.
 */
export const TAGS_CACHE_TTL = {
    /** 10 minutes - applied to both tags:all and tags:category:{category}. */
    TAGS_LIST: 600,
} as const;

/**
 * Module-level event names and Pub/Sub channel identifiers.
 */
export const TAGS_MODULE_CONSTANTS = {
    /** Event name published to content_events when a tag is updated via PATCH. */
    TAG_UPDATED: "TAG_UPDATED",
    /** Redis Pub/Sub channel on which TAG_UPDATED events are published. */
    CONTENT_EVENTS_CHANNEL: "content_events",
} as const;

/**
 * User-facing message strings returned by tags endpoints.
 * Reserved for future use - no messages currently needed.
 */
export const TAGS_MESSAGES = {} as const;

/**
 * Canonical list of valid tag categories.
 * This is the single source of truth - import in DTOs for @IsIn validation.
 * Add new categories here only; no DB migration required.
 */
export const TAG_CATEGORIES = [
    "language",
    "frontend",
    "backend",
    "devops",
    "ai",
    "data",
] as const;

/**
 * Union type derived from TAG_CATEGORIES for static type checking.
 */
export type TagCategory = (typeof TAG_CATEGORIES)[number];

/**
 * Rate-limit configurations for write endpoints (POST and PATCH).
 * Applied via @SetRateLimit + @UseGuards(RateLimitGuard).
 */
export const TAGS_RATE_LIMITS = {
    /** 20 write operations per hour per authenticated user. */
    WRITE: { limit: 20, windowSeconds: 3600, scope: "user" as const },
} as const;
