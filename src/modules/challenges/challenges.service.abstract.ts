/**
 * @module modules/challenges/challenges.service.abstract
 * @description
 * Abstract class contract for the challenges application service.
 *
 * Controllers depend on this abstract class rather than the concrete
 * implementation.  DI is wired in ChallengesModule so `ChallengesService`
 * (token) resolves to `ChallengesServiceImpl` (concrete class).
 */

import { CreateChallengeDto } from "./dto/create-challenge.dto";
import { UpdateChallengeDto } from "./dto/update-challenge.dto";
import { SubmitAttemptDto } from "./dto/submit-attempt.dto";
import { ChallengeResponseDto } from "./dto/challenge-response.dto";
import { AttemptResultDto } from "./dto/attempt-result.dto";
import { Challenge } from "./entities/challenge.entity";

/** Shape returned by getMyAttempts. */
export interface MyAttemptsResponse {
    challenge_id: string;
    attempts: {
        id: string;
        submitted_answer: string;
        is_correct: boolean;
        attempted_at: string;
    }[];
    is_locked: boolean;
    attempts_used: number;
}

export abstract class ChallengesService {
    /**
     * Creates a new challenge attached to a reel.
     *
     * @param userId  UUID of the caller (admin or reel creator).
     * @param reelId  UUID of the reel to attach the challenge to.
     * @param dto     Validated creation payload.
     * @param isAdmin Whether the caller has admin role.
     * @returns       The newly created Challenge row.
     * @throws        ReelNotFoundException             reel not found.
     * @throws        InvalidChallengePayloadException  any validation rule violated.
     */
    abstract createChallenge(
        userId: string,
        reelId: string,
        dto: CreateChallengeDto,
        isAdmin: boolean,
    ): Promise<Challenge>;

    /**
     * Partially updates an existing challenge.
     * Accessible by admins and the reel's creator.
     * Validates cross-field rules using the effective type
     * (updated type if provided, existing type otherwise).
     *
     * @param userId      UUID of the caller.
     * @param challengeId UUID of the challenge to update.
     * @param dto         Partial update payload.
     * @param isAdmin     Whether the caller has admin role.
     * @returns           Updated Challenge row.
     * @throws            ChallengeNotFoundException        challenge not found.
     * @throws            InvalidChallengePayloadException  validation rule violated.
     */
    abstract updateChallenge(
        userId: string,
        challengeId: string,
        dto: UpdateChallengeDto,
        isAdmin: boolean,
    ): Promise<Challenge>;

    /**
     * Soft-deletes a challenge.
     * Accessible by admins and the reel's creator.
     *
     * @param userId      UUID of the caller.
     * @param challengeId UUID of the challenge to delete.
     * @param isAdmin     Whether the caller has admin role.
     * @throws            ChallengeNotFoundException        challenge not found.
     * @throws            InvalidChallengePayloadException  caller does not own reel.
     */
    abstract deleteChallenge(
        userId: string,
        challengeId: string,
        isAdmin: boolean,
    ): Promise<void>;

    /**
     * Returns all challenges for a reel with the requesting user's latest attempt status merged into each entry. correct_answer is stripped.
     *
     * @param userId UUID of the requesting user.
     * @param reelId UUID of the reel.
     * @returns      Ordered ChallengeResponseDto[].
     * @throws       ReelNotFoundException if reel does not exist or is not active.
     */
    abstract getChallenges(
        userId: string,
        reelId: string,
    ): Promise<ChallengeResponseDto[]>;

    /** 
     * Submits and evaluates an attempt for a challenge.
     * 
     * @param userId         UUID of the submitting user.
     * @param challengeId    UUID of the challenge.
     * @param dto            Submitted answer payload.
     * @param idempotencyKey Optional client-supplied idempotency key.
     * @returns              Full attempt result.
     * @throws               ChallengeNotFoundException    challenge not found.
     * @throws               AlreadyCompletedException     already answered correctly.
     * @throws               MaxAttemptsException          all attempts exhausted.
     * @throws               IdempotencyConflictException  same key, different body.
     */
    abstract submitAttempt(
        userId: string,
        challengeId: string,
        dto: SubmitAttemptDto,
        idempotencyKey?: string,
    ): Promise<AttemptResultDto>;

    /**
     * Returns full attempt history for a user on a single challenge.
     *
     * @param userId      UUID of the requesting user.
     * @param challengeId UUID of the challenge.
     * @returns           Attempt list with lock status and count.
     * @throws            ChallengeNotFoundException if challenge does not exist.
     */
    abstract getMyAttempts(
        userId: string,
        challengeId: string,
    ): Promise<MyAttemptsResponse>;
}
