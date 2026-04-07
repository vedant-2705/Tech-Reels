/**
 * @module modules/feed/feed.interface
 * @description
 * Payload type contracts for the Feed module.
 *
 * Ownership rule applied here:
 *   AffinityUpdateWorker and FeedBuildWorker both live in Feed,
 *   so their payload types are defined here.
 *
 * FeedBuildJobPayload is dispatched by multiple modules (Reels, Auth, Users, Feed itself)
 * but CONSUMED by FeedBuildWorker - Feed owns the contract.
 * Dispatchers that need the type import from here.
 */

// ---------------------------------------------------------------------------
// Affinity Update queue job payload
// Consumed by: AffinityUpdateWorker
// Dispatched by: Feed affinity handlers (watch-ended, liked, unliked, saved, unsaved, shared)
// ---------------------------------------------------------------------------

export interface AffinityUpdateJobPayload {
    userId: string;
    reelId: string;
    /**
     * Event type string from AppMessage.type of the triggering interaction.
     * AffinityUpdateWorker switches on this to determine the delta to apply.
     * Use values from REELS_MANIFEST.events.*.eventType.
     */
    eventType: string;
    /** Only present for REEL_WATCH_ENDED - determines WATCH_HIGH/MID/LOW delta tier. */
    completion_pct?: number;
}

// ---------------------------------------------------------------------------
// Feed Build queue job payload
// Consumed by: FeedBuildWorker
// Dispatched by: Reels (cold_start, search, share), Auth/Users (new_user), Feed (feed_low)
// ---------------------------------------------------------------------------

export interface FeedBuildJobPayload {
    userId: string;
    /**
     * Reason string for observability - FeedBuildWorker does not branch on this.
     * Use FEED_JOB_REASONS values from feed.constants.ts.
     */
    reason: string;
}

export interface FeedRebuildJobPayload extends FeedBuildJobPayload { }

export interface FeedBuildForNewUserJobPayload extends FeedBuildJobPayload { }
