/**
 * @module modules/challenges/challenges.repository
 * @description
 * Data-access layer for the Challenges module.
 * Combines PostgreSQL persistence (DatabaseService) and Redis cache
 * operations (RedisService) following the same pattern as TagsRepository
 * and UsersRepository.
 *
 * Pattern rules (mirrors existing codebase):
 *   - DB methods:    pure SQL - query DB, return domain types or null, no cache ops.
 *   - Cache methods: pure Redis - get/set/del, no DB calls.
 *   - Service owns cache-aside orchestration (check cache -> miss -> DB -> set cache).
 *
 * Repository methods return domain types or null - never throw AppExceptions.
 * All SQL uses parameterised queries - never string concatenation.
 * deleted_at IS NULL on all soft-delete table queries.
 */

import { Injectable } from "@nestjs/common";
import { DatabaseService } from "@database/database.service";
import { RedisService } from "@redis/redis.service";
import {
    Challenge,
    AttemptSummary,
    ChallengeAttempt,
    UserAttemptStatus,
    InsertAttemptData,
    IdempotencyEntry,
    InsertChallengeData,
    UpdateChallengeData,
} from "./entities/challenge.entity";
import {
    CHALLENGES_REDIS_KEYS,
    CHALLENGES_CACHE_TTL,
} from "./challenges.constants";

/** Minimal reel projection returned by findReelById and findReelWithCreator. */
interface ReelLookup extends Record<string, unknown> {
    id: string;
    status: string;
    creator_id?: string;
}

/**
 * Repository for challenge persistence and attempt tracking.
 * DB methods and cache methods are strictly separated.
 * The service layer composes them via cache-aside logic.
 */
@Injectable()
export class ChallengesRepository {
    /**
     * @param db    PostgreSQL database service.
     * @param redis Redis service for cache operations.
     */
    constructor(
        private readonly db: DatabaseService,
        private readonly redis: RedisService,
    ) {}

    // =========================================================================
    // DB - Reel lookup
    // =========================================================================

    /**
     * Fetches id and status of a non-deleted reel.
     * Cross-table query kept here to avoid cross-module repository imports.
     *
     * @param reelId UUID of the reel.
     * @returns      { id, status } or null if not found / soft-deleted.
     */
    async findReelById(reelId: string): Promise<ReelLookup | null> {
        const result = await this.db.query<ReelLookup>(
            `SELECT id, status
             FROM   reels
             WHERE  id = $1
               AND  deleted_at IS NULL`,
            [reelId],
        );
        return result.rows[0] ?? null;
    }

    /**
     * Fetches id, status, and creator_id of a non-deleted reel.
     * Used for ownership checks in create / update / delete challenge flows.
     *
     * @param reelId UUID of the reel.
     * @returns      { id, status, creator_id } or null.
     */
    async findReelWithCreator(reelId: string): Promise<ReelLookup | null> {
        const result = await this.db.query<ReelLookup>(
            `SELECT id, status, creator_id
             FROM   reels
             WHERE  id = $1
               AND  deleted_at IS NULL`,
            [reelId],
        );
        return result.rows[0] ?? null;
    }

    // =========================================================================
    // DB - Challenge lookups
    // =========================================================================

    /**
     * Fetches all non-deleted challenges for a reel, ordered by position.
     * Includes correct_answer - service strips it before returning to client.
     *
     * @param reelId UUID of the reel.
     * @returns      Ordered Challenge[] (may be empty).
     */
    async findByReelId(reelId: string): Promise<Challenge[]> {
        const result = await this.db.query<Challenge>(
            `SELECT id, reel_id, type, question, options, correct_answer,
                    explanation, difficulty, xp_reward, token_reward,
                    case_sensitive, "order", max_attempts,
                    created_at, updated_at, deleted_at
             FROM   challenges
             WHERE  reel_id    = $1
               AND  deleted_at IS NULL
             ORDER  BY "order" ASC`,
            [reelId],
        );
        return result.rows;
    }

    /**
     * Fetches a single non-deleted challenge by primary key.
     * Includes correct_answer and case_sensitive for evaluator use.
     *
     * @param challengeId UUID of the challenge.
     * @returns           Challenge row or null if not found / soft-deleted.
     */
    async findById(challengeId: string): Promise<Challenge | null> {
        const result = await this.db.query<Challenge>(
            `SELECT id, reel_id, type, question, options, correct_answer,
                    explanation, difficulty, xp_reward, token_reward,
                    case_sensitive, "order", max_attempts,
                    created_at, updated_at, deleted_at
             FROM   challenges
             WHERE  id         = $1
               AND  deleted_at IS NULL`,
            [challengeId],
        );
        return result.rows[0] ?? null;
    }

    // =========================================================================
    // DB - Attempt lookups
    // =========================================================================

    /**
     * Returns the latest attempt per challenge for a user across a batch of
     * challenge IDs. DISTINCT ON gives one row per challenge_id.
     *
     * @param userId       UUID of the requesting user.
     * @param challengeIds Array of challenge UUIDs to look up.
     * @returns            One UserAttemptStatus per attempted challenge.
     */
    async getUserAttempts(
        userId: string,
        challengeIds: string[],
    ): Promise<UserAttemptStatus[]> {
        if (challengeIds.length === 0) return [];

        const result = await this.db.query<UserAttemptStatus>(
            `SELECT DISTINCT ON (challenge_id)
                    challenge_id, is_correct, submitted_answer, attempted_at
             FROM   challenges_attempts
             WHERE  user_id      = $1
               AND  challenge_id = ANY($2)
             ORDER  BY challenge_id, attempted_at DESC`,
            [userId, challengeIds],
        );
        return result.rows;
    }

    /**
     * Returns a compact attempt summary for the lock/retry gate in submitAttempt.
     *
     * @param userId      UUID of the user.
     * @param challengeId UUID of the challenge.
     * @returns           { attempt_count, has_correct }
     */
    async getAttemptSummary(
        userId: string,
        challengeId: string,
    ): Promise<AttemptSummary> {
        const result = await this.db.query<{
            attempt_count: string;
            has_correct: boolean;
        }>(
            `SELECT COUNT(*)             AS attempt_count,
                    BOOL_OR(is_correct)  AS has_correct
             FROM   challenges_attempts
             WHERE  user_id      = $1
               AND  challenge_id = $2`,
            [userId, challengeId],
        );
        const row = result.rows[0];
        return {
            attempt_count: parseInt(row?.attempt_count ?? "0", 10),
            has_correct: row?.has_correct ?? false,
        };
    }

    /**
     * Returns full ordered attempt history for a user on a single challenge.
     *
     * @param userId      UUID of the user.
     * @param challengeId UUID of the challenge.
     * @returns           ChallengeAttempt[] ordered oldest-first.
     */
    async getAttemptsForUser(
        userId: string,
        challengeId: string,
    ): Promise<ChallengeAttempt[]> {
        const result = await this.db.query<ChallengeAttempt>(
            `SELECT id, submitted_answer, is_correct, attempted_at
             FROM   challenges_attempts
             WHERE  user_id      = $1
               AND  challenge_id = $2
             ORDER  BY attempted_at ASC`,
            [userId, challengeId],
        );
        return result.rows;
    }

    // =========================================================================
    // DB - Attempt writes
    // =========================================================================

    /**
     * Inserts a new attempt row. challenges_attempts is append-only -
     * no updated_at or deleted_at columns.
     *
     * @param data Full attempt payload including pre-generated UUID v7 id.
     * @returns    The inserted row's id.
     */
    async insertAttempt(data: InsertAttemptData): Promise<{ id: string }> {
        const result = await this.db.query<{ id: string }>(
            `INSERT INTO challenges_attempts
               (id, user_id, challenge_id, submitted_answer, is_correct,
                xp_awarded, attempt_number, attempted_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, now())
             RETURNING id`,
            [
                data.id,
                data.user_id,
                data.challenge_id,
                data.submitted_answer,
                data.is_correct,
                data.xp_awarded,
                data.attempt_number,
            ],
        );
        return result.rows[0];
    }

    // =========================================================================
    // DB - User XP
    // =========================================================================

    /**
     * Reads the denormalised total_xp column from the users table.
     * Intentional - kept in sync by XP award worker. Fast synchronous read.
     *
     * @param userId UUID of the user.
     * @returns      Current total XP.
     */
    async getTotalXp(userId: string): Promise<number> {
        const result = await this.db.query<{ total_xp: number }>(
            `SELECT total_xp FROM users WHERE id = $1`,
            [userId],
        );
        return result.rows[0]?.total_xp ?? 0;
    }

    // =========================================================================
    // DB - Challenge writes (create / update / soft-delete)
    // =========================================================================

    /**
     * Returns the count of non-deleted challenges for a reel.
     * Used to enforce the CHALLENGE_MAX_PER_REEL limit before insert.
     *
     * @param reelId UUID of the reel.
     * @returns      Current challenge count.
     */
    async countByReelId(reelId: string): Promise<number> {
        const result = await this.db.query<{ count: string }>(
            `SELECT COUNT(*) AS count
             FROM   challenges
             WHERE  reel_id    = $1
               AND  deleted_at IS NULL`,
            [reelId],
        );
        return parseInt(result.rows[0]?.count ?? "0", 10);
    }

    /**
     * Returns the next available order value for a reel's challenges.
     * Used when the caller omits the order field on create.
     *
     * @param reelId UUID of the reel.
     * @returns      MAX("order") + 1, or 1 if no challenges exist yet.
     */
    async getNextOrder(reelId: string): Promise<number> {
        const result = await this.db.query<{ max_order: number | null }>(
            `SELECT MAX("order") AS max_order
             FROM   challenges
             WHERE  reel_id    = $1
               AND  deleted_at IS NULL`,
            [reelId],
        );
        return (result.rows[0]?.max_order ?? 0) + 1;
    }

    /**
     * Inserts a new challenge row and returns the full created row.
     *
     * @param data Full insert payload including pre-generated UUID v7 id.
     * @returns    The newly created Challenge row.
     */
    async insertChallenge(data: InsertChallengeData): Promise<Challenge> {
        const result = await this.db.query<Challenge>(
            `INSERT INTO challenges
               (id, reel_id, type, question, options, correct_answer,
                explanation, difficulty, xp_reward, token_reward,
                case_sensitive, "order", max_attempts,
                created_at, updated_at)
             VALUES
               ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), now())
             RETURNING
               id, reel_id, type, question, options, correct_answer,
               explanation, difficulty, xp_reward, token_reward,
               case_sensitive, "order", max_attempts,
               created_at, updated_at, deleted_at`,
            [
                data.id,
                data.reel_id,
                data.type,
                data.question,
                data.options ? JSON.stringify(data.options) : null,
                data.correct_answer,
                data.explanation,
                data.difficulty,
                data.xp_reward,
                data.token_reward,
                data.case_sensitive,
                data.order,
                data.max_attempts,
            ],
        );
        return result.rows[0];
    }

    /**
     * Partially updates a challenge. Uses COALESCE so omitted fields keep
     * their current DB values. Always sets updated_at = now().
     * options uses CASE/WHEN to distinguish explicit null (clear) from omitted.
     *
     * @param challengeId UUID of the challenge to update.
     * @param data        Fields to update.
     * @returns           Updated Challenge row.
     */
    async updateChallenge(
        challengeId: string,
        data: UpdateChallengeData,
    ): Promise<Challenge> {
        const result = await this.db.query<Challenge>(
            `UPDATE challenges SET
                type           = COALESCE($2, type),
                question       = COALESCE($3, question),
                options        = CASE
                                     WHEN $4::jsonb IS NULL AND $5::boolean = true THEN NULL
                                     WHEN $4::jsonb IS NOT NULL                    THEN $4
                                     ELSE options
                                 END,
                correct_answer = COALESCE($6, correct_answer),
                explanation    = COALESCE($7, explanation),
                difficulty     = COALESCE($8, difficulty),
                xp_reward      = COALESCE($9, xp_reward),
                case_sensitive = COALESCE($10, case_sensitive),
                "order"        = COALESCE($11, "order"),
                updated_at     = now()
             WHERE id         = $1
               AND deleted_at IS NULL
             RETURNING
               id, reel_id, type, question, options, correct_answer,
               explanation, difficulty, xp_reward, token_reward,
               case_sensitive, "order", max_attempts,
               created_at, updated_at, deleted_at`,
            [
                challengeId,
                data.type ?? null,
                data.question ?? null,
                data.options !== undefined && data.options !== null
                    ? JSON.stringify(data.options)
                    : null,
                data.clearOptions ?? false,
                data.correct_answer !== undefined
                    ? String(data.correct_answer)
                    : null,
                data.explanation ?? null,
                data.difficulty ?? null,
                data.xp_reward ?? null,
                data.case_sensitive !== undefined ? data.case_sensitive : null,
                data.order ?? null,
            ],
        );
        return result.rows[0];
    }

    /**
     * Soft-deletes a challenge by setting deleted_at = now().
     *
     * @param challengeId UUID of the challenge to soft-delete.
     */
    async softDeleteChallenge(challengeId: string): Promise<void> {
        await this.db.query(
            `UPDATE challenges
             SET deleted_at = now(),
                 updated_at = now()
             WHERE id         = $1
               AND deleted_at IS NULL`,
            [challengeId],
        );
    }

    // =========================================================================
    // Cache - Challenge list per reel
    // =========================================================================

    /**
     * Returns cached challenge list for a reel, or null on a miss.
     * Stored with correct_answer - service strips before returning to client.
     *
     * @param reelId UUID of the reel.
     * @returns      Parsed Challenge[] or null.
     */
    async getCachedChallengesByReel(
        reelId: string,
    ): Promise<Challenge[] | null> {
        const raw = await this.redis.get(
            `${CHALLENGES_REDIS_KEYS.REEL_CHALLENGES}:${reelId}`,
        );
        if (!raw) return null;
        try {
            return JSON.parse(raw) as Challenge[];
        } catch {
            return null;
        }
    }

    /**
     * Caches the full challenge list for a reel.
     *
     * @param reelId     UUID of the reel.
     * @param challenges Challenge[] to serialise and store.
     */
    async setCachedChallengesByReel(
        reelId: string,
        challenges: Challenge[],
    ): Promise<void> {
        await this.redis.set(
            `${CHALLENGES_REDIS_KEYS.REEL_CHALLENGES}:${reelId}`,
            JSON.stringify(challenges),
            CHALLENGES_CACHE_TTL.REEL_CHALLENGES,
        );
    }

    /**
     * Invalidates the challenge list cache for a reel.
     * Called on challenge create / update / delete (future scope).
     *
     * @param reelId UUID of the reel.
     */
    async invalidateChallengesByReelCache(reelId: string): Promise<void> {
        await this.redis.del(
            `${CHALLENGES_REDIS_KEYS.REEL_CHALLENGES}:${reelId}`,
        );
    }

    // =========================================================================
    // Cache - Single challenge by ID
    // =========================================================================

    /**
     * Returns a cached single challenge row, or null on a miss.
     *
     * @param challengeId UUID of the challenge.
     * @returns           Parsed Challenge or null.
     */
    async getCachedChallengeById(
        challengeId: string,
    ): Promise<Challenge | null> {
        const raw = await this.redis.get(
            `${CHALLENGES_REDIS_KEYS.CHALLENGE_BY_ID}:${challengeId}`,
        );
        if (!raw) return null;
        try {
            return JSON.parse(raw) as Challenge;
        } catch {
            return null;
        }
    }

    /**
     * Caches a single challenge row. Only called on a DB hit - null is never cached.
     *
     * @param challenge The Challenge row to store.
     */
    async setCachedChallengeById(challenge: Challenge): Promise<void> {
        await this.redis.set(
            `${CHALLENGES_REDIS_KEYS.CHALLENGE_BY_ID}:${challenge.id}`,
            JSON.stringify(challenge),
            CHALLENGES_CACHE_TTL.CHALLENGE_BY_ID,
        );
    }

    /**
     * Invalidates the single-challenge cache entry.
     * Called on challenge update / delete (future scope).
     *
     * @param challengeId UUID of the challenge.
     */
    async invalidateChallengeByIdCache(challengeId: string): Promise<void> {
        await this.redis.del(
            `${CHALLENGES_REDIS_KEYS.CHALLENGE_BY_ID}:${challengeId}`,
        );
    }

    // =========================================================================
    // Cache - Attempt summary
    // =========================================================================

    /**
     * Returns cached attempt summary, or null on a miss.
     *
     * @param userId      UUID of the user.
     * @param challengeId UUID of the challenge.
     * @returns           Parsed AttemptSummary or null.
     */
    async getCachedAttemptSummary(
        userId: string,
        challengeId: string,
    ): Promise<AttemptSummary | null> {
        const raw = await this.redis.get(
            `${CHALLENGES_REDIS_KEYS.ATTEMPT_SUMMARY}:${userId}:${challengeId}`,
        );
        if (!raw) return null;
        try {
            return JSON.parse(raw) as AttemptSummary;
        } catch {
            return null;
        }
    }

    /**
     * Caches the attempt summary. Called after every insertAttempt so the
     * lock/retry gate is consistent on subsequent requests without a DB hit.
     *
     * @param userId      UUID of the user.
     * @param challengeId UUID of the challenge.
     * @param summary     Updated AttemptSummary to store.
     */
    async setCachedAttemptSummary(
        userId: string,
        challengeId: string,
        summary: AttemptSummary,
    ): Promise<void> {
        await this.redis.set(
            `${CHALLENGES_REDIS_KEYS.ATTEMPT_SUMMARY}:${userId}:${challengeId}`,
            JSON.stringify(summary),
            CHALLENGES_CACHE_TTL.ATTEMPT_SUMMARY,
        );
    }

    // =========================================================================
    // Cache - Attempt history list
    // =========================================================================

    /**
     * Returns cached attempt history, or null on a miss.
     *
     * @param userId      UUID of the user.
     * @param challengeId UUID of the challenge.
     * @returns           Parsed ChallengeAttempt[] or null.
     */
    async getCachedAttemptsForUser(
        userId: string,
        challengeId: string,
    ): Promise<ChallengeAttempt[] | null> {
        const raw = await this.redis.get(
            `${CHALLENGES_REDIS_KEYS.ATTEMPT_HISTORY}:${userId}:${challengeId}`,
        );
        if (!raw) return null;
        try {
            return JSON.parse(raw) as ChallengeAttempt[];
        } catch {
            return null;
        }
    }

    /**
     * Caches the full attempt history. Called after invalidateAttemptsForUserCache
     * forces a DB re-fetch, so the fresh list is immediately cached.
     *
     * @param userId      UUID of the user.
     * @param challengeId UUID of the challenge.
     * @param attempts    Full ordered ChallengeAttempt[] to store.
     */
    async setCachedAttemptsForUser(
        userId: string,
        challengeId: string,
        attempts: ChallengeAttempt[],
    ): Promise<void> {
        await this.redis.set(
            `${CHALLENGES_REDIS_KEYS.ATTEMPT_HISTORY}:${userId}:${challengeId}`,
            JSON.stringify(attempts),
            CHALLENGES_CACHE_TTL.ATTEMPT_HISTORY,
        );
    }

    /**
     * Invalidates the attempt history cache for a user+challenge.
     * Called after insertAttempt - forces next read to fetch from DB
     * (required because DB-generated attempted_at is not available in the service).
     *
     * @param userId      UUID of the user.
     * @param challengeId UUID of the challenge.
     */
    async invalidateAttemptsForUserCache(
        userId: string,
        challengeId: string,
    ): Promise<void> {
        await this.redis.del(
            `${CHALLENGES_REDIS_KEYS.ATTEMPT_HISTORY}:${userId}:${challengeId}`,
        );
    }

    // =========================================================================
    // Cache - User attempt status per reel (for GET /reels/:reelId/challenges)
    // =========================================================================

    /**
     * Returns cached latest-attempt-per-challenge for a user+reel, or null.
     *
     * @param userId UUID of the user.
     * @param reelId UUID of the reel.
     * @returns      Parsed UserAttemptStatus[] or null.
     */
    async getCachedUserReelAttempts(
        userId: string,
        reelId: string,
    ): Promise<UserAttemptStatus[] | null> {
        const raw = await this.redis.get(
            `${CHALLENGES_REDIS_KEYS.USER_REEL_ATTEMPTS}:${userId}:${reelId}`,
        );
        if (!raw) return null;
        try {
            return JSON.parse(raw) as UserAttemptStatus[];
        } catch {
            return null;
        }
    }

    /**
     * Caches latest-attempt-per-challenge for a user+reel pair.
     *
     * @param userId   UUID of the user.
     * @param reelId   UUID of the reel.
     * @param attempts UserAttemptStatus[] to store.
     */
    async setCachedUserReelAttempts(
        userId: string,
        reelId: string,
        attempts: UserAttemptStatus[],
    ): Promise<void> {
        await this.redis.set(
            `${CHALLENGES_REDIS_KEYS.USER_REEL_ATTEMPTS}:${userId}:${reelId}`,
            JSON.stringify(attempts),
            CHALLENGES_CACHE_TTL.USER_REEL_ATTEMPTS,
        );
    }

    /**
     * Invalidates the user+reel attempt status cache.
     * Called after a successful insertAttempt.
     *
     * @param userId UUID of the user.
     * @param reelId UUID of the reel the challenge belongs to.
     */
    async invalidateUserReelAttemptsCache(
        userId: string,
        reelId: string,
    ): Promise<void> {
        await this.redis.del(
            `${CHALLENGES_REDIS_KEYS.USER_REEL_ATTEMPTS}:${userId}:${reelId}`,
        );
    }

    // =========================================================================
    // Cache - Idempotency
    // =========================================================================

    /**
     * Returns a cached idempotency entry for a user+key pair, or null on miss.
     *
     * @param userId         UUID of the user.
     * @param idempotencyKey Client-supplied idempotency key.
     * @returns              Parsed IdempotencyEntry or null.
     */
    async getCachedIdempotencyEntry(
        userId: string,
        idempotencyKey: string,
    ): Promise<IdempotencyEntry | null> {
        const raw = await this.redis.get(
            `${CHALLENGES_REDIS_KEYS.IDEMPOTENCY}:${userId}:${idempotencyKey}`,
        );
        if (!raw) return null;
        try {
            return JSON.parse(raw) as IdempotencyEntry;
        } catch {
            return null;
        }
    }

    /**
     * Stores an idempotency entry after a successful attempt evaluation.
     * TTL = 24 hours to outlive any reasonable client retry window.
     *
     * @param userId         UUID of the user.
     * @param idempotencyKey Client-supplied idempotency key.
     * @param entry          { requestBodyHash, response } to store.
     */
    async setCachedIdempotencyEntry(
        userId: string,
        idempotencyKey: string,
        entry: IdempotencyEntry,
    ): Promise<void> {
        await this.redis.set(
            `${CHALLENGES_REDIS_KEYS.IDEMPOTENCY}:${userId}:${idempotencyKey}`,
            JSON.stringify(entry),
            CHALLENGES_CACHE_TTL.IDEMPOTENCY,
        );
    }
}
