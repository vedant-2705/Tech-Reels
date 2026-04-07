import { ChallengeDifficulty } from "./challenges.constants";

export interface ChallengesBadgeEvaluationJobPayload {
    userId: string;
    event: string;
    meta?: Record<string, unknown>;
}

export interface ChallengesXpAwardJobPayload {
    userId: string;
    source: string;
    xp_amount: number;
    reference_id?: string;
}

export interface ChallengesAttemptSubmittedEventPayload {
    userId: string;
    challengeId: string;
    is_correct: boolean;
    difficulty: ChallengeDifficulty;
    meta?: Record<string, unknown>;
}

export interface AttemptSubmittedEventPayload {
    userId: string;
    challengeId: string;
    /** Whether the attempt was correct. */
    correct: boolean;
}
