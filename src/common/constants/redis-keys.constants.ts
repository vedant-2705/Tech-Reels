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
