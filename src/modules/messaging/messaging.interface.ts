// ---------------------------------------------------------------------------
// AppMessage Envelope
//
// Every BullMQ job and every Redis Pub/Sub event is stored as AppMessage<T>.
//
// Workers access data via:  job.data.payload  (not job.data directly)
// Subscribers parse into:   AppMessage<EventPayload>
//
// BaseWorker and BaseSubscriber handle the unwrapping so individual
// handlers never touch the envelope fields.
// ---------------------------------------------------------------------------

export interface AppMessageMetadata {
    /** Propagated from AsyncLocalStorage / CLS - set at the HTTP boundary. */
    correlationId?: string;
    /** The userId driving the action, when applicable. */
    userId?: string;
}

export interface AppMessage<T = unknown> {
    /** UUIDv4 - unique per message, useful for deduplication / idempotency checks. */
    id: string;
    /**
     * The job name or event type string.
     * e.g. GAMIFICATION_QUEUE_JOBS.XP_AWARD or FEED_EVENTS.FEED_LOW
     * Workers and subscribers switch/route on this field.
     */
    type: string;
    /** ISO 8601 timestamp of when the message was dispatched. */
    timestamp: string;
    /** The actual typed payload. Workers receive this after BaseWorker unwraps it. */
    payload: T;
    metadata?: AppMessageMetadata;
}

// ---------------------------------------------------------------------------
// Typed Job Payload Contracts
//
// One interface per job type. Workers type their process() method against
// AppMessage<XxxJobPayload>. This ensures type safety end-to-end.
// ---------------------------------------------------------------------------

interface CommonJobPayload {
    userId: string;
}
// --- Auth / Users ---

export interface WelcomeEmailJobPayload extends CommonJobPayload {  
}

export interface NewUserJobPayload extends CommonJobPayload {
    reason: string;
}

export interface RebuildFeedJobPayload extends CommonJobPayload {
}

// --- Reels / Feed ---

export interface FeedColdStartJobPayload extends CommonJobPayload {
    reason: string;
}

export interface ProcessVideoJobPayload extends CommonJobPayload {
    reelId: string;
}

// --- Gamification: XP Award ---

export interface XpAwardJobPayload extends CommonJobPayload {
    source: string; // XP_SOURCE enum value from gamification module
    xp_amount: number;
    reference_id?: string;
    note?: string;
}

// --- Gamification: Badge Evaluation ---

export interface BadgeEvaluationJobPayload extends CommonJobPayload {
    event: string; // GAMIFICATION_INBOUND_EVENTS value
    meta?: Record<string, unknown>;
}

// --- Gamification: Streak ---

export interface UpdateUserStreakJobPayload extends CommonJobPayload {
}

// --- Gamification: Leaderboard / Streak Reset (scheduled, no payload) ---

export interface WeeklyLeaderboardResetJobPayload {
    // Intentionally empty - scheduled repeatable job, no input needed.
}

export interface StreakResetJobPayload {
    // Intentionally empty - scheduled repeatable job, no input needed.
}

// --- Notifications ---

export interface SendNotificationJobPayload extends CommonJobPayload {
    type: string;
    data?: Record<string, unknown>;
}

// --- Skill Paths ---

export interface SkillPathXpAwardJobPayload extends CommonJobPayload {
    source: string;
    xp_amount: number;
    reference_id?: string;
}

export interface SkillPathBadgeEvaluationJobPayload extends CommonJobPayload {
    event: string;
    meta?: Record<string, unknown>;
}

export interface SkillPathNotificationJobPayload extends CommonJobPayload {
    type: string;
    data?: Record<string, unknown>;
}

// --- Challenges ---

export interface ChallengesXpAwardJobPayload extends CommonJobPayload {
    source: string;
    xp_amount: number;
    reference_id?: string;
}

export interface ChallengesBadgeEvaluationJobPayload extends CommonJobPayload {
    event: string;
    meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Typed Pub/Sub Event Payload Contracts
//
// Subscribers parse AppMessage<XxxEventPayload> after envelope unwrapping.
// ---------------------------------------------------------------------------

interface CommonEventPayload {
    userId: string;
}

export interface FeedLowEventPayload extends CommonEventPayload {
    remaining: number;
}

export interface ReelDeletedEventPayload extends CommonEventPayload {
    reelId: string;
}

export interface ReelStatusChangedEventPayload {
    reelId: string;
    status: string;
}

export interface TagUpdatedEventPayload {
    tagId: string;
}

export interface ReelWatchEndedEventPayload extends CommonEventPayload {
    reelId: string;
    watch_duration_secs: number;
    completion_pct: number;
}

export interface ReelInteractionEventPayload extends CommonEventPayload {
    reelId: string;
}

export interface PathCompletedEventPayload extends CommonEventPayload {
    pathId: string;
    xp_amount: number;
}

export interface XpAwardedEventPayload extends CommonEventPayload {
    xp_amount: number;
    source: string;
}

export interface BadgeEarnedEventPayload extends CommonEventPayload {
    badgeId: string;
}

export interface ChallengeCorrectEventPayload extends CommonEventPayload {
    challengeId: string;
    xp_awarded: number;
}
