/**
 * @module modules/challenges/challenges.service
 * @description
 * Application service for the Challenges module.
 * Owns all business logic and cache-aside orchestration - mirrors TagsService
 * and UsersService patterns.
 *
 * Cache-aside pattern per operation:
 *   getChallenges:   cache(reel) hit -> return | miss -> DB -> set cache
 *                    cache(userReelAttempts) hit -> return | miss -> DB -> set cache
 *   submitAttempt:   idempotency check -> cache(challenge) -> cache(summary) ->
 *                    DB insert -> set cache(summary) -> invalidate caches -> queue jobs
 *   getMyAttempts:   cache(challenge) -> cache(attempts) hit -> return | miss -> DB -> set cache
 *
 * Never calls DatabaseService directly - all DB and cache ops go through repository.
 */

import { Injectable } from "@nestjs/common";
import * as crypto from "crypto";

import { ChallengesService } from "./challenges.service.abstract";
import { ChallengesRepository } from "./challenges.repository";
import { EvaluatorRegistry } from "./evaluators/evaluator.registry";

import {
    ChallengeResponseDto,
    ChallengeAttemptStatusDto,
} from "./dto/challenge-response.dto";
import { SubmitAttemptDto } from "./dto/submit-attempt.dto";
import { AttemptResultDto } from "./dto/attempt-result.dto";

import { ChallengeNotFoundException } from "./exceptions/challenge-not-found.exception";
import { AlreadyCompletedException } from "./exceptions/already-completed.exception";
import { MaxAttemptsException } from "./exceptions/max-attempts.exception";
import { IdempotencyConflictException } from "./exceptions/idempotency-conflict.exception";

import { ReelNotFoundException } from "@modules/reels/exceptions/reel-not-found.exception";
import { REEL_STATUS } from "@modules/reels/reels.constants";

import {
    CHALLENGES_BADGE_EVENTS,
    CHALLENGES_XP_SOURCE,
    CHALLENGE_TYPE,
    CHALLENGE_DEFAULT_TOKEN_REWARD,
    CHALLENGE_DEFAULT_MAX_ATTEMPTS,
    CHALLENGE_XP_REWARD,
    CHALLENGE_MAX_PER_REEL,
} from "./challenges.constants";

import { uuidv7 } from "@common/utils/uuidv7.util";
import {
    Challenge,
    AttemptSummary,
    IdempotencyEntry,
} from "./entities/challenge.entity";
import { InvalidChallengePayloadException } from "./exceptions/invalid-challenge-payload.exception";
import { UpdateChallengeDto } from "./dto/update-challenge.dto";
import { CreateChallengeDto } from "./dto/create-challenge.dto";
import { OptionsValidatorService } from "./services/options-validator.service";
import { MessagingService } from "@modules/messaging";
import { CHALLENGES_DISPATCH } from "./challenges.messaging";
import { MyAttemptsResponse } from "./challenges.service.abstract";

/**
 * Coordinates challenge reads, attempt submission, gamification side effects,
 * and cache-aside orchestration.
 */
@Injectable()
export class ChallengesServiceImpl extends ChallengesService {
    /**
     * @param challengesRepository Challenge and attempt data-access + cache layer.
     * @param optionsValidator     Validates challenge options based on type (e.g. MCQ must have options, code_fill must not).
     * @param messagingService     Used to publish events and dispatch jobs for gamification side effects (XP, badges).
     */
    constructor(
        private readonly challengesRepository: ChallengesRepository,
        private readonly optionsValidator: OptionsValidatorService,
        private readonly messagingService: MessagingService,
    ) {
        super();
    }

    // -------------------------------------------------------------------------
    // createChallenge
    // -------------------------------------------------------------------------

    /**
     *
     * Accessible by admins and the reel's creator.
     *
     * Validations (service-layer):
     *   - Reel must exist
     *   - Caller must be admin OR the reel creator (ownership check)
     *   - Reel must not already have CHALLENGE_MAX_PER_REEL challenges
     *   - options[] must be present for mcq/true_false, absent for others
     *   - options[] length must match type requirements
     *   - correct_answer index must be in range for mcq/true_false
     *
     * @inheritdoc
     */
    async createChallenge(
        userId: string,
        reelId: string,
        dto: CreateChallengeDto,
        isAdmin: boolean,
    ): Promise<Challenge> {
        // Reel must exist (not necessarily active - creator may add before publish)
        const reel = await this.challengesRepository.findReelById(reelId);
        if (!reel) throw new ReelNotFoundException();

        // Ownership: admin bypasses, creator must own the reel
        if (!isAdmin) {
            const reelRow =
                await this.challengesRepository.findReelWithCreator(reelId);
            if (!reelRow || reelRow.creator_id !== userId) {
                throw new InvalidChallengePayloadException(
                    "You do not have permission to add challenges to this reel.",
                );
            }
        }

        // Max challenges per reel
        const count = await this.challengesRepository.countByReelId(reelId);
        if (count >= CHALLENGE_MAX_PER_REEL) {
            throw new InvalidChallengePayloadException(
                `A reel can have at most ${CHALLENGE_MAX_PER_REEL} challenges.`,
            );
        }

        // Cross-field validation: options vs type
        this.optionsValidator.validateOptionsForType(
            dto.type,
            dto.options ?? null,
            dto.correct_answer,
        );

        // Resolve order - use provided value or auto-assign next position
        const order =
            dto.order ?? (await this.challengesRepository.getNextOrder(reelId));

        // Derive XP reward from difficulty
        const xp_reward = CHALLENGE_XP_REWARD[dto.difficulty];

        // Persist
        const challenge = await this.challengesRepository.insertChallenge({
            id: uuidv7(),
            reel_id: reelId,
            type: dto.type,
            question: dto.question,
            options: dto.options ?? null,
            correct_answer: String(dto.correct_answer),
            explanation: dto.explanation,
            difficulty: dto.difficulty,
            xp_reward,
            token_reward: CHALLENGE_DEFAULT_TOKEN_REWARD,
            case_sensitive: dto.case_sensitive ?? false,
            order,
            max_attempts: CHALLENGE_DEFAULT_MAX_ATTEMPTS,
        });

        // Invalidate reel challenge list cache
        await this.challengesRepository.invalidateChallengesByReelCache(reelId);

        return challenge;
    }

    // -------------------------------------------------------------------------
    // updateChallenge
    // -------------------------------------------------------------------------

    /** @inheritdoc */
    async updateChallenge(
        userId: string,
        challengeId: string,
        dto: UpdateChallengeDto,
        isAdmin: boolean,
    ): Promise<Challenge> {
        // Fetch existing challenge (cache-aside)
        let existing =
            await this.challengesRepository.getCachedChallengeById(challengeId);
        if (!existing) {
            existing = await this.challengesRepository.findById(challengeId);
            if (!existing) throw new ChallengeNotFoundException();
            await this.challengesRepository.setCachedChallengeById(existing);
        }

        // Ownership check
        if (!isAdmin) {
            const reelRow = await this.challengesRepository.findReelWithCreator(
                existing.reel_id,
            );
            if (!reelRow || reelRow.creator_id !== userId) {
                throw new InvalidChallengePayloadException(
                    "You do not have permission to edit this challenge.",
                );
            }
        }

        // Cross-field validation using effective (post-update) type and options
        const effectiveType = dto.type ?? existing.type;
        const effectiveOptions =
            dto.options !== undefined ? dto.options : existing.options;
        const effectiveAnswer = dto.correct_answer ?? existing.correct_answer;

        this.optionsValidator.validateOptionsForType(
            effectiveType,
            effectiveOptions,
            effectiveAnswer,
        );

        // Derive updated xp_reward if difficulty changed
        const xp_reward = dto.difficulty
            ? CHALLENGE_XP_REWARD[dto.difficulty]
            : undefined;

        const updated = await this.challengesRepository.updateChallenge(
            challengeId,
            {
                type: dto.type,
                question: dto.question,
                options: dto.options !== undefined ? dto.options : undefined,
                clearOptions: dto.options === null,
                correct_answer: dto.correct_answer,
                explanation: dto.explanation,
                difficulty: dto.difficulty,
                xp_reward,
                case_sensitive: dto.case_sensitive,
                order: dto.order,
            },
        );

        // Invalidate caches
        await this.challengesRepository.invalidateChallengeByIdCache(
            challengeId,
        );
        await this.challengesRepository.invalidateChallengesByReelCache(
            existing.reel_id,
        );

        return updated;
    }

    // -------------------------------------------------------------------------
    // deleteChallenge
    // -------------------------------------------------------------------------

    /** @inheritdoc */
    async deleteChallenge(
        userId: string,
        challengeId: string,
        isAdmin: boolean,
    ): Promise<void> {
        // Fetch challenge (cache-aside)
        let challenge =
            await this.challengesRepository.getCachedChallengeById(challengeId);
        if (!challenge) {
            challenge = await this.challengesRepository.findById(challengeId);

            if (!challenge) throw new ChallengeNotFoundException();

            await this.challengesRepository.setCachedChallengeById(challenge);
        }

        // Ownership check
        if (!isAdmin) {
            const reelRow = await this.challengesRepository.findReelWithCreator(
                challenge.reel_id,
            );
            if (!reelRow || reelRow.creator_id !== userId) {
                throw new InvalidChallengePayloadException(
                    "You do not have permission to delete this challenge.",
                );
            }
        }

        // Soft-delete
        await this.challengesRepository.softDeleteChallenge(challengeId);

        // Invalidate caches
        await this.challengesRepository.invalidateChallengeByIdCache(
            challengeId,
        );
        await this.challengesRepository.invalidateChallengesByReelCache(
            challenge.reel_id,
        );
    }

    // -------------------------------------------------------------------------
    // getChallenges
    // -------------------------------------------------------------------------

    /**
     *
     * Cache-aside:
     *   1. challenge list   -> getCachedChallengesByReel -> miss -> findByReelId -> set cache
     *   2. user reel status -> getCachedUserReelAttempts -> miss -> getUserAttempts -> set cache
     *
     * @inheritdoc
     */
    async getChallenges(
        userId: string,
        reelId: string,
    ): Promise<ChallengeResponseDto[]> {
        // 1. Reel status always read fresh - status can change (active -> disabled)
        const reel = await this.challengesRepository.findReelById(reelId);
        if (!reel || reel.status !== REEL_STATUS.ACTIVE) {
            throw new ReelNotFoundException();
        }

        // Challenge list - cache-aside
        let challenges =
            await this.challengesRepository.getCachedChallengesByReel(reelId);
        if (!challenges) {
            challenges = await this.challengesRepository.findByReelId(reelId);
            await this.challengesRepository.setCachedChallengesByReel(
                reelId,
                challenges,
            );
        }

        if (challenges.length === 0) return [];

        // User attempt status per reel - cache-aside
        const challengeIds = challenges.map((c) => c.id);

        let userAttempts =
            await this.challengesRepository.getCachedUserReelAttempts(
                userId,
                reelId,
            );
        if (!userAttempts) {
            userAttempts = await this.challengesRepository.getUserAttempts(
                userId,
                challengeIds,
            );
            await this.challengesRepository.setCachedUserReelAttempts(
                userId,
                reelId,
                userAttempts,
            );
        }

        // Index by challenge_id for O(1) merge
        const attemptMap = new Map(
            userAttempts.map((a) => [a.challenge_id, a]),
        );

        // Merge attempt status and strip correct_answer
        return challenges.map((challenge): ChallengeResponseDto => {
            const attempt = attemptMap.get(challenge.id);

            const attemptStatus: ChallengeAttemptStatusDto = attempt
                ? {
                      is_correct: attempt.is_correct,
                      submitted_answer: attempt.submitted_answer,
                      attempted_at: attempt.attempted_at,
                  }
                : {
                      is_correct: null,
                      submitted_answer: null,
                      attempted_at: null,
                  };

            return {
                id: challenge.id,
                reel_id: challenge.reel_id,
                type: challenge.type,
                question: challenge.question,
                options: challenge.options,
                difficulty: challenge.difficulty,
                xp_reward: challenge.xp_reward,
                order: challenge.order,
                attempt: attemptStatus,
                // correct_answer intentionally omitted
            };
        });
    }

    // -------------------------------------------------------------------------
    // submitAttempt
    // -------------------------------------------------------------------------

    /**
     *
     * Flow:
     *   1.  Idempotency check (cache) - replay or conflict or proceed
     *   2.  Challenge lookup (cache-aside)
     *   3.  Attempt summary (cache-aside) - AlreadyCompleted / MaxAttempts gate
     *   4.  Evaluate via EvaluatorRegistry
     *   5.  DB insert (insertAttempt)
     *   6.  Update attempt summary cache (write-through)
     *   7.  Invalidate attempt history cache + user-reel attempts cache
     *   8.  Publish ATTEMPT_SUBMITTED
     *   9.  Fire-and-forget XP + badge queue jobs (correct only)
     *   10. Read new_total_xp
     *   11. Store idempotency response
     *   12. Return result
     *
     *  @inheritdoc
     */
    async submitAttempt(
        userId: string,
        challengeId: string,
        dto: SubmitAttemptDto,
        idempotencyKey?: string,
    ): Promise<AttemptResultDto> {
        // Idempotency check
        if (idempotencyKey) {
            const cached =
                await this.challengesRepository.getCachedIdempotencyEntry(
                    userId,
                    idempotencyKey,
                );
            if (cached) {
                const bodyHash = this.hashRequestBody(dto);
                if (cached.requestBodyHash !== bodyHash) {
                    throw new IdempotencyConflictException();
                }
                // Same key + same body -> replay
                return cached.response as unknown as AttemptResultDto;
            }
        }

        // Challenge lookup - cache-aside
        let challenge =
            await this.challengesRepository.getCachedChallengeById(challengeId);
        if (!challenge) {
            challenge = await this.challengesRepository.findById(challengeId);
            if (!challenge) throw new ChallengeNotFoundException();
            await this.challengesRepository.setCachedChallengeById(challenge);
        }

        // Attempt summary - cache-aside
        let summary = await this.challengesRepository.getCachedAttemptSummary(
            userId,
            challengeId,
        );
        if (!summary) {
            summary = await this.challengesRepository.getAttemptSummary(
                userId,
                challengeId,
            );
            await this.challengesRepository.setCachedAttemptSummary(
                userId,
                challengeId,
                summary,
            );
        }

        if (summary.has_correct) throw new AlreadyCompletedException();
        if (summary.attempt_count >= challenge.max_attempts)
            throw new MaxAttemptsException();

        // Evaluate via registry
        const evaluator = EvaluatorRegistry.get(challenge.type);
        const { is_correct } = evaluator.evaluate({
            challenge,
            submittedAnswer: dto.answer,
        });

        const xp_awarded = is_correct ? challenge.xp_reward : 0;
        const attemptNumber = summary.attempt_count + 1;

        // DB insert
        await this.challengesRepository.insertAttempt({
            id: uuidv7(),
            user_id: userId,
            challenge_id: challengeId,
            submitted_answer: String(dto.answer),
            is_correct,
            xp_awarded,
            attempt_number: attemptNumber,
        });

        // Write-through: update attempt summary cache with new state
        const updatedSummary: AttemptSummary = {
            attempt_count: attemptNumber,
            // Preserve has_correct=true if it was already true (defensive)
            has_correct: summary.has_correct || is_correct,
        };
        await this.challengesRepository.setCachedAttemptSummary(
            userId,
            challengeId,
            updatedSummary,
        );

        // Invalidate stale caches
        // Attempt history: invalidate so next read fetches DB (DB-generated attempted_at)
        await this.challengesRepository.invalidateAttemptsForUserCache(
            userId,
            challengeId,
        );
        // User-reel status: invalidate so GET /reels/:reelId/challenges reflects new attempt
        await this.challengesRepository.invalidateUserReelAttemptsCache(
            userId,
            challenge.reel_id,
        );

        // Publish ATTEMPT_SUBMITTED (always, correct or not)
        void CHALLENGES_DISPATCH.attemptSubmitted(this.messagingService, {
            userId,
            challengeId,
            is_correct,
            difficulty: challenge.difficulty,
        });

        // Async side effects - correct answers only
        if (is_correct) {
            void CHALLENGES_DISPATCH.xpAward(this.messagingService, {
                userId,
                source: CHALLENGES_XP_SOURCE.CHALLENGE_CORRECT,
                xp_amount: xp_awarded,
                reference_id: challengeId,
            });

            void CHALLENGES_DISPATCH.badgeEvaluation(this.messagingService, {
                userId,
                event: CHALLENGES_BADGE_EVENTS.CHALLENGE_CORRECT,
                meta: { difficulty: challenge.difficulty },
            });
        }

        // Read denormalised total_xp (always returned, correct or not)
        const new_total_xp =
            (await this.challengesRepository.getTotalXp(userId)) + xp_awarded;

        const attempts_left = is_correct
            ? 0
            : Math.max(0, challenge.max_attempts - attemptNumber);

        // Build response
        const response: AttemptResultDto = {
            is_correct,
            correct_answer: this.formatCorrectAnswer(challenge),
            explanation: challenge.explanation,
            xp_awarded,
            attempt_number: attemptNumber,
            attempts_left,
            new_total_xp,
            badges_earned: [],
        };

        // Store idempotency entry if key was provided
        if (idempotencyKey) {
            const entry: IdempotencyEntry = {
                requestBodyHash: this.hashRequestBody(dto),
                response: response as unknown as Record<string, unknown>,
            };
            await this.challengesRepository.setCachedIdempotencyEntry(
                userId,
                idempotencyKey,
                entry,
            );
        }

        return response;
    }

    // -------------------------------------------------------------------------
    // getMyAttempts
    // -------------------------------------------------------------------------

    /**
     *
     * Cache-aside:
     *   1. challenge  -> getCachedChallengeById -> miss -> findById -> set cache
     *   2. attempts   -> getCachedAttemptsForUser -> miss -> getAttemptsForUser -> set cache
     *
     * @inheritdoc
     */
    async getMyAttempts(
        userId: string,
        challengeId: string,
    ): Promise<MyAttemptsResponse> {
        // Challenge lookup - cache-aside
        let challenge =
            await this.challengesRepository.getCachedChallengeById(challengeId);
        if (!challenge) {
            challenge = await this.challengesRepository.findById(challengeId);
            if (!challenge) throw new ChallengeNotFoundException();
            await this.challengesRepository.setCachedChallengeById(challenge);
        }

        // Attempt history - cache-aside
        let attempts = await this.challengesRepository.getCachedAttemptsForUser(
            userId,
            challengeId,
        );
        if (!attempts) {
            attempts = await this.challengesRepository.getAttemptsForUser(
                userId,
                challengeId,
            );
            await this.challengesRepository.setCachedAttemptsForUser(
                userId,
                challengeId,
                attempts,
            );
        }

        // Lock: correct answer OR max_attempts reached
        const is_locked =
            attempts.some((a) => a.is_correct) ||
            attempts.length >= challenge.max_attempts;

        return {
            challenge_id: challengeId,
            attempts,
            is_locked,
            attempts_used: attempts.length,
        };
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Computes a SHA-256 hex digest of the request body for idempotency
     * conflict detection.
     *
     * @param dto The SubmitAttemptDto to hash.
     * @returns   SHA-256 hex string.
     */
    private hashRequestBody(dto: SubmitAttemptDto): string {
        return crypto
            .createHash("sha256")
            .update(JSON.stringify({ answer: dto.answer }))
            .digest("hex");
    }

    /**
     * Formats correct_answer for the response.
     * MCQ / true_false: stored as string index -> returned as number.
     * code_fill / output_prediction: returned as-is.
     *
     * @param challenge Full challenge row.
     * @returns         Correct answer as string | number.
     */
    private formatCorrectAnswer(challenge: Challenge): string | number {
        if (
            challenge.type === CHALLENGE_TYPE.MCQ ||
            challenge.type === CHALLENGE_TYPE.TRUE_FALSE
        ) {
            return parseInt(challenge.correct_answer, 10);
        }
        return challenge.correct_answer;
    }
}
