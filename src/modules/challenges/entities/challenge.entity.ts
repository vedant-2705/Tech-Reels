/**
 * @module modules/challenges/entities/challenge.entity
 * @description
 * TypeScript interface mirroring the challenges DB table row.
 * This is NOT an ORM entity - it is a plain typed interface used
 * as the return type of repository query methods.
 *
 * Table: challenges (soft-delete, append-only attempts in challenges_attempts)
 */

import { ChallengeType, ChallengeDifficulty } from "../challenges.constants";

/**
 * Mirrors a row in the challenges table.
 * correct_answer is TEXT for both MCQ (stored as '0','1','2','3')
 * and code_fill / output_prediction (the expected string value).
 * options is JSONB - parsed to string[] for mcq/true_false, null otherwise.
 */
export interface Challenge extends Record<string, unknown> {
    id: string;
    reel_id: string;
    type: ChallengeType;
    question: string;
    options: string[] | null;
    correct_answer: string;
    explanation: string;
    difficulty: ChallengeDifficulty;
    xp_reward: number;
    token_reward: number;
    case_sensitive: boolean;
    order: number;
    max_attempts: number;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
}

/**
 * Attempt summary returned by getAttemptSummary repository method.
 */
export interface AttemptSummary {
    attempt_count: number;
    has_correct: boolean;
}

/**
 * Single attempt row returned by getAttemptsForUser repository method.
 */
export interface ChallengeAttempt extends Record<string, unknown> {
    id: string;
    submitted_answer: string;
    is_correct: boolean;
    attempted_at: string;
}

/**
 * Latest attempt per challenge returned by getUserAttempts repository method.
 */
export interface UserAttemptStatus extends Record<string, unknown> {
    challenge_id: string;
    is_correct: boolean;
    submitted_answer: string;
    attempted_at: string;
}

/**
 * Payload passed to challengesRepository.insertAttempt().
 */
export interface InsertAttemptData {
    id: string;
    user_id: string;
    challenge_id: string;
    submitted_answer: string;
    is_correct: boolean;
    xp_awarded: number;
    attempt_number: number;
}

/**
 * Shape stored in the idempotency cache for POST /challenges/:id/attempt.
 * requestBodyHash is a SHA-256 hex digest of the raw request body -
 * used to detect same-key / different-body conflicts.
 */
export interface IdempotencyEntry {
    requestBodyHash: string;
    response: Record<string, unknown>;
}

/**
 * Payload accepted by challengesRepository.insertChallenge().
 * xp_reward is derived from difficulty in the service.
 * token_reward uses platform default (2).
 * max_attempts uses platform default (3).
 */
export interface InsertChallengeData {
    id: string;
    reel_id: string;
    type: string;
    question: string;
    options: string[] | null;
    correct_answer: string;
    explanation: string;
    difficulty: string;
    xp_reward: number;
    token_reward: number;
    case_sensitive: boolean;
    order: number;
    max_attempts: number;
}

/**
 * Payload accepted by challengesRepository.updateChallenge().
 * All fields optional - undefined means keep current DB value.
 * clearOptions = true signals an explicit null for options (CASE/WHEN in SQL).
 */
export interface UpdateChallengeData {
    type?: string;
    question?: string;
    options?: string[] | null;
    clearOptions?: boolean;
    correct_answer?: string | number;
    explanation?: string;
    difficulty?: string;
    xp_reward?: number;
    case_sensitive?: boolean;
    order?: number;
}
