/**
 * @module common/constants/redis-keys
 * @description
 * Shared Redis key patterns referenced by more than one module.
 * Centralised here to prevent key-string drift between writers and readers.
 *
 * Rules:
 *   - Import this file in any module that reads OR writes these keys.
 *   - Never hardcode these strings elsewhere.
 *   - Full key construction is documented per constant.
 */

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

/**
 * Weekly leaderboard sorted set key prefix.
 *
 * Full key: leaderboard:weekly:{tagId}
 *
 * Writer: GamificationRepository.incrementLeaderboardScore()
 * Reader: UsersRepository.getLeaderboardRank()
 *
 * Score = user's total XP earned this week for the given tag.
 * Member = userId.
 * Reset: every Monday 00:00 UTC by LeaderboardResetWorker.
 */
export const LEADERBOARD_WEEKLY_KEY_PREFIX = "leaderboard:weekly";

/**
 * Top tags cache key prefix per user.
 *
 * Full key: top_tags:{userId}
 *
 * Writer: GamificationRepository (after affinity update)
 * Reader: UsersRepository.getLeaderboardRank()
 *
 * Value: JSON-serialised string[] of tagIds ordered by affinity score DESC.
 */
export const TOP_TAGS_KEY_PREFIX = "top_tags";

// ---------------------------------------------------------------------------
// Reel metadata (shared by Reels, Feed, Media)
// ---------------------------------------------------------------------------

/**
 * Hash: full reel metadata. TTL 300s.
 *
 * Full key: reel:meta:{reelId}
 *
 * Writer: ReelsRepository.setMetaCache(), ReelsProcessingService.setReelsToCache()
 * Reader: ReelsRepository.getMetaFromCache(), Feed module scoring
 */
export const REEL_META_PREFIX = "reel:meta";

// ---------------------------------------------------------------------------
// Tag sets (shared by Reels, Feed)
// ---------------------------------------------------------------------------

/**
 * Set: active reel IDs per tag. No TTL - permanent.
 *
 * Full key: reel_tags:tag:{tagId}
 *
 * Writer: ReelsRepository.bulkAddToTagSets() / bulkRemoveFromTagSets()
 * Reader: ReelsFeedService (SUNION for search), Feed module (SUNION for scoring)
 */
export const REEL_TAG_SET_PREFIX = "reel_tags:tag";

// ---------------------------------------------------------------------------
// Feed list (shared by Reels, Feed)
// ---------------------------------------------------------------------------

/**
 * List: personalised feed reel IDs per user. TTL 1800s.
 *
 * Full key: feed:{userId}
 *
 * Writer: Feed module (RPUSH after scoring)
 * Reader: Reels module (LPOP in getFeed)
 */
export const FEED_PREFIX = "feed";

// ---------------------------------------------------------------------------
// Bloom filter - watched (shared by Reels, Feed)
// ---------------------------------------------------------------------------

/**
 * Bloom filter: watched reel IDs per user. TTL 30 days.
 *
 * Full key: watched:{userId}
 *
 * Writer: Reels module (BF.ADD after watch event)
 * Reader: Feed module (BF.MEXISTS for dedup), ReelsSearchService (BF.MEXISTS)
 */
export const WATCHED_PREFIX = "watched";

// ---------------------------------------------------------------------------
// Tags cache (shared by Tags, Reels, Media)
// ---------------------------------------------------------------------------

/**
 * Cache key for the full tag catalogue (no category filter).
 *
 * Full key: tags:all
 *
 * Writer: TagsRepository
 * Invalidated by: Reels module (on reel status change), Media module (on processing complete)
 */
export const TAGS_ALL_KEY = "tags:all";

/**
 * Prefix for per-category tag cache keys.
 *
 * Full key: tags:category:{category}
 *
 * Writer: TagsRepository
 * Invalidated by: Reels module, Media module
 */
export const TAGS_CATEGORY_PREFIX = "tags:category";

// ---------------------------------------------------------------------------
// Pub/Sub channels (shared across 6+ modules)
// ---------------------------------------------------------------------------

/**
 * Pub/Sub channel for content lifecycle events.
 *
 * Events: REEL_DELETED, REEL_STATUS_CHANGED, TAG_UPDATED,
 *         PROCESSING_COMPLETE, PROCESSING_FAILED, REEL_ACTIVATED
 *
 * Publishers: Reels module, Media module, Tags module
 * Subscribers: Gamification module, Feed module
 */
export const PUBSUB_CONTENT_EVENTS = "content_events";

/**
 * Pub/Sub channel for user interaction events.
 *
 * Events: REEL_LIKED, REEL_UNLIKED, REEL_SAVED, REEL_UNSAVED, REEL_SHARED
 *
 * Publishers: Reels module
 * Subscribers: Feed module, Gamification module
 */
export const PUBSUB_USER_INTERACTIONS = "user_interactions";

/**
 * Pub/Sub channel for video watch telemetry.
 *
 * Events: REEL_WATCH_ENDED
 *
 * Publishers: Reels module
 * Subscribers: Gamification module, SkillPaths module, Feed module
 */
export const PUBSUB_VIDEO_TELEMETRY = "video_telemetry";

/**
 * Pub/Sub channel for feed lifecycle events.
 *
 * Events: FEED_LOW
 *
 * Publishers: Reels module (when remaining < threshold)
 * Subscribers: Feed module
 */
export const PUBSUB_FEED_EVENTS = "feed_events";

/**
 * Pub/Sub channel for transactional events (notifications, account lifecycle).
 *
 * Events: ACCOUNT_DEACTIVATED, notification dispatch
 *
 * Publishers: Auth module, Users module
 * Subscribers: Notification module
 */
export const PUBSUB_TRANSACTIONAL = "transactional";
