/**
 * @module modules/gamification/gamification.interface
 * @description
 * Payload type contracts for the Gamification module.
 *
 * Ownership rule applied here:
 *   Job payloads are owned by the module whose WORKER consumes them.
 *   XpAwardWorker and BadgeEvaluationWorker both live in Gamification,
 *   so their payload types are defined here.
 *
 * Cross-module usage:
 *   Challenges and SkillPaths both dispatch XP and badge jobs.
 *   They import these types from here — the consumer defines the contract,
 *   dispatchers must conform to it.
 *
 *   import { XpAwardJobPayload } from '@modules/gamification/gamification.interface';
 */

// ---------------------------------------------------------------------------
// XP Award queue job payload
// Consumed by: XpAwardWorker
// Dispatched by: GamificationSubscriber, ChallengesService, SkillPathsService
// ---------------------------------------------------------------------------

export interface XpAwardJobPayload {
    userId: string;
    /** Must match a valid xp_source enum value in the xp_ledger table. */
    source: string;
    xp_amount: number;
    /** ID of the entity that triggered this award (reelId, pathId, challengeId). */
    reference_id?: string;
    /** Optional human-readable note for admin grants. */
    note?: string;
}

// ---------------------------------------------------------------------------
// Badge Evaluation queue job payload
// Consumed by: BadgeEvaluationWorker
// Dispatched by: GamificationSubscriber, ChallengesService, SkillPathsService
// ---------------------------------------------------------------------------

export interface BadgeEvaluationJobPayload {
    userId: string;
    /**
     * The triggering event string — drives which badge criteria are evaluated.
     * e.g. 'challenge_correct', 'path_completed', 'REEL_WATCH_ENDED'
     * Use the relevant *_BADGE_EVENTS or GAMIFICATION_INBOUND_EVENTS constants.
     */
    event: string;
    /** context for criteria that need extra data (difficulty, pathId, etc.) */
    meta: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Streak update job payload
// Consumed by: StreakResetWorker (UPDATE_USER_STREAK job)
// Dispatched by: GamificationSubscriber on REEL_WATCH_ENDED
// ---------------------------------------------------------------------------

export interface UpdateUserStreakJobPayload {
    userId: string;
}

// ---------------------------------------------------------------------------
// Scheduled job payloads (no input — cron-triggered)
// ---------------------------------------------------------------------------

/** Weekly leaderboard reset — scheduled repeatable, no input needed. */
export type WeeklyLeaderboardResetJobPayload = Record<string, never>;

/** Daily streak reset — scheduled repeatable, no input needed. */
export type DailyStreakResetJobPayload = Record<string, never>;

// ---------------------------------------------------------------------------
// Gamification event payloads
// Owned here because Gamification PUBLISHES these events.
// Subscribers (SSE, Notifications) import from here.
// ---------------------------------------------------------------------------

export interface XpAwardedEventPayload {
    userId: string;
    xp_amount: number;
    source: string;
}

export interface BadgeEarnedEventPayload {
    userId: string;
    badgeId: string;
}
