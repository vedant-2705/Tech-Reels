/**
 * @module modules/messaging/messaging.constants
 * @description
 * Infrastructure-level constants owned by the MessagingModule.
 */

import { JobsOptions } from "bullmq";

// ---------------------------------------------------------------------------
// Redis Pub/Sub Channels
// Physical channel names. Only the registry maps events to these.
// ---------------------------------------------------------------------------

export const REDIS_CHANNELS = {
    CONTENT_EVENTS: "content_events",
    USER_INTERACTIONS: "user_interactions",
    VIDEO_TELEMETRY: "video_telemetry",
    FEED_EVENTS: "feed_events",
    TRANSACTIONAL: "transactional",
    GAMIFICATION_EVENTS: "gamification_events",
} as const;

export type RedisChannel = (typeof REDIS_CHANNELS)[keyof typeof REDIS_CHANNELS];

// ---------------------------------------------------------------------------
// Default BullMQ Job Options
// Baseline for every queue.add() call. Callers may override per-dispatch.
// ---------------------------------------------------------------------------

export const DEFAULT_JOB_OPTIONS: Readonly<JobsOptions> = {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: true,
    removeOnFail: 1000,
} as const;
