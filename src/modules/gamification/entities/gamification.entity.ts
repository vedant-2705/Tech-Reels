/**
 * @module modules/gamification/entities/gamification.entity
 * @description
 * TypeScript interfaces (NOT ORM entities) for all domain types used
 * within the Gamification module. These mirror DB column names exactly.
 */

// ---------------------------------------------------------------------------
// XP Ledger
// ---------------------------------------------------------------------------

/**
 * Represents a single row in the xp_ledger table.
 * Append-only - never mutated after insert.
 */
export interface XpLedgerEntry {
    id: string;
    user_id: string;
    delta: number;
    source: string;
    reference_id: string | null;
    note: string | null;
    created_at: string;
}

/**
 * Payload required to insert a new xp_ledger row.
 */
export interface InsertXpLedgerData {
    id: string;
    user_id: string;
    delta: number;
    source: string;
    reference_id: string | null;
    note: string | null;
}

// ---------------------------------------------------------------------------
// User streak fields (subset of users row)
// ---------------------------------------------------------------------------

/**
 * Streak-relevant columns from the users table.
 * Returned by repository streak queries to avoid fetching the full user row.
 */
export interface UserStreakRow extends Record<string, unknown> {
    id: string;
    current_streak: number;
    longest_streak: number;
    last_active_date: string | null; // DATE returned as ISO string e.g. '2025-03-15'
    streak_freeze_until: string | null; // DATE or null
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

/**
 * Full badge catalogue row including criteria JSONB.
 * Fetched by badge evaluation worker to run criteria checks.
 */
export interface Badge extends Record<string, unknown> {
    id: string;
    code: string;
    name: string;
    description: string;
    icon_url: string;
    criteria: BadgeCriteria;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

/**
 * Discriminated union of all badge criteria shapes stored in badges.criteria JSONB.
 * The `type` field is the discriminant used by BadgeCriteriaRegistry.
 */
export type BadgeCriteria =
    | ChallengeCorrectCountCriteria
    | AccuracyStreakCriteria
    | TopicMasterCriteria;

export interface ChallengeCorrectCountCriteria {
    type: "challenge_correct_count";
    threshold: number;
    event_trigger: string;
}

export interface AccuracyStreakCriteria {
    type: "accuracy_streak";
    threshold: number;
    event_trigger: string;
}

export interface TopicMasterCriteria {
    type: "topic_master";
    tagId: string | null;
    event_trigger: string;
}

// ---------------------------------------------------------------------------
// User badge (awarded junction)
// ---------------------------------------------------------------------------

/**
 * Represents a row in the user_badges table.
 */
export interface UserBadge {
    id: string;
    user_id: string;
    badge_id: string;
    earned_at: string;
}

/**
 * Badge with metadata joined for SSE/response payloads.
 */
export interface AwardedBadgePayload {
    badgeId: string;
    badgeCode: string;
    badgeName: string;
    iconUrl: string;
    earnedAt: string;
}

// ---------------------------------------------------------------------------
// Criteria evaluation context
// ---------------------------------------------------------------------------

/**
 * Context object passed to ICriteria.evaluate().
 * Provides all data a criteria evaluator might need without
 * coupling evaluators to the repository directly.
 */
export interface CriteriaEvaluationContext {
    userId: string;
    meta: Record<string, unknown>;
    /** Total correct challenge answers for this user (pre-fetched). */
    totalCorrectCount: number;
    /** Recent challenge attempts ordered oldest-first (pre-fetched). */
    recentAttempts: RecentAttemptRow[];
}

/**
 * Minimal attempt row used for accuracy streak calculation.
 */
export interface RecentAttemptRow extends Record<string, unknown> {
    is_correct: boolean;
    attempted_at: string;
}

// ---------------------------------------------------------------------------
// Challenge row (minimal - read by XP worker for token_reward)
// ---------------------------------------------------------------------------

/**
 * Minimal challenge projection read by XP award worker
 * when source = 'challenge_correct'.
 */
export interface ChallengeTokenRow extends Record<string, unknown> {
    token_reward: number;
    reel_id: string;
}

// ---------------------------------------------------------------------------
// Reel tag row (read by XP worker for affinity update)
// ---------------------------------------------------------------------------

/**
 * Tag IDs associated with a reel. Read by XP worker to update
 * user_topic_affinity after a reel watch event.
 */
export interface ReelTagRow extends Record<string, unknown> {
    tag_id: string;
}
