/**
 * @module modules/reels/reels.interface
 * @description
 * Event payload type contracts for the Reels module.
 *
 * Ownership rule applied here:
 *   Event payloads are owned by the module that PUBLISHES them.
 *   Reels publishes all interaction, telemetry, feed, and content events.
 *   Subscribers (Feed, Gamification, SkillPaths) import from here.
 *
 *   import { ReelWatchEndedEventPayload } from '@modules/reels/reels.interface';
 *
 * If Reels renames a field, every subscriber's import breaks at compile time.
 * That is the intended behaviour — refactors become visible immediately.
 */

// ---------------------------------------------------------------------------
// Base event payloads for reuse
// ---------------------------------------------------------------------------
interface BaseUserReelEvent {
    userId: string;
    reelId: string;
}

interface BaseReelEvent {
    reelId: string;
}

interface BaseUserEvent {
    userId: string;
}

// ---------------------------------------------------------------------------
// User Interaction event payloads (user_interactions channel)
// ---------------------------------------------------------------------------

export interface ReelLikedEventPayload extends BaseUserReelEvent {
    /** Tag IDs associated with the reel — used by affinity scoring. */
    tags: string[];
}

export interface ReelUnlikedEventPayload extends BaseUserReelEvent {}

export interface ReelSavedEventPayload extends BaseUserReelEvent {}

export interface ReelUnsavedEventPayload extends BaseUserReelEvent {}

export interface ReelSharedEventPayload extends BaseUserReelEvent {
    /** Tag IDs — used by affinity scoring and feed personalisation. */
    tags: string[];
}

// ---------------------------------------------------------------------------
// Video Telemetry event payload (video_telemetry channel)
// ---------------------------------------------------------------------------

export interface ReelWatchEndedEventPayload extends BaseUserReelEvent {
    watch_duration_secs: number;
    /** 0-100. Used by AffinityUpdateWorker to determine WATCH_HIGH/MID/LOW delta. */
    completion_pct: number;
}

// ---------------------------------------------------------------------------
// Feed event payloads (feed_events channel)
// ---------------------------------------------------------------------------

export interface FeedLowEventPayload extends BaseUserEvent {
    /** Number of items remaining in the feed cache at time of publish. */
    remaining: number;
}

// ---------------------------------------------------------------------------
// Content event payloads (content_events channel)
// ---------------------------------------------------------------------------

export interface ReelDeletedEventPayload extends BaseUserReelEvent {}

export interface ReelStatusChangedEventPayload extends BaseReelEvent {
    /** New status value — matches REEL_STATUS enum. */
    status: string;
}

// ---------------------------------------------------------------------------
// Reels job payloads
// Consumed by: VideoProcessingWorker (Media), FeedBuildWorker (Feed)
// Owned here because Reels dispatches them and owns the semantics.
// ---------------------------------------------------------------------------

export interface VideoProcessJobPayload extends BaseUserReelEvent {
    rawKey: string;
}

export interface FeedColdStartJobPayload extends BaseUserEvent {
    reason: string;
}

export interface FeedSearchJobPayload extends BaseUserEvent {
    reason: string;
    tagIds: string[];
}

export interface FeedShareJobPayload extends BaseUserEvent {
    reason: string;
    tagIds: string[];
}
