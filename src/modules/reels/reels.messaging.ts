/**
 * @module modules/reels/reels.messaging
 * @description
 * Messaging manifest for the Reels module.
 * Declares every BullMQ job and Redis Pub/Sub event the Reels module emits.
 *
 * Other modules that subscribe to reels events import directly from here:
 *
 *   import { REELS_MANIFEST } from '@modules/reels/reels.messaging';
 *
 *   // In a subscriber's route():
 *   if (message.type === REELS_MANIFEST.events.REEL_WATCH_ENDED.eventType) { ... }
 *
 * This creates an explicit, type-checked dependency from subscriber to publisher.
 * If the Reels team renames an event, TypeScript fails at the subscriber's import site.
 */

import { ModuleMessagingManifest } from "@modules/messaging/messaging.types";
import { REDIS_CHANNELS } from "@modules/messaging/messaging.constants";
import { QUEUES } from "src/queues/queue-names";

export const REELS_MANIFEST = {
    jobs: {
        VIDEO_PROCESS: {
            jobName: "process",
            queue: QUEUES.VIDEO_PROCESSING,
        },
        FEED_COLD_START: {
            jobName: "cold_start",
            queue: QUEUES.FEED_BUILD,
        },
        FEED_SEARCH: {
            jobName: "search",
            queue: QUEUES.FEED_BUILD,
        },
        FEED_SHARE: {
            jobName: "share",
            queue: QUEUES.FEED_BUILD,
        },
    },
    events: {
        // user_interactions channel
        REEL_LIKED: {
            eventType: "REEL_LIKED",
            channel: REDIS_CHANNELS.USER_INTERACTIONS,
        },
        REEL_UNLIKED: {
            eventType: "REEL_UNLIKED",
            channel: REDIS_CHANNELS.USER_INTERACTIONS,
        },
        REEL_SAVED: {
            eventType: "REEL_SAVED",
            channel: REDIS_CHANNELS.USER_INTERACTIONS,
        },
        REEL_UNSAVED: {
            eventType: "REEL_UNSAVED",
            channel: REDIS_CHANNELS.USER_INTERACTIONS,
        },
        REEL_SHARED: {
            eventType: "REEL_SHARED",
            channel: REDIS_CHANNELS.USER_INTERACTIONS,
        },
        // video_telemetry channel
        REEL_WATCH_ENDED: {
            eventType: "REEL_WATCH_ENDED",
            channel: REDIS_CHANNELS.VIDEO_TELEMETRY,
        },
        // feed_events channel
        FEED_LOW: {
            eventType: "FEED_LOW",
            channel: REDIS_CHANNELS.FEED_EVENTS,
        },
        // content_events channel
        REEL_DELETED: {
            eventType: "REEL_DELETED",
            channel: REDIS_CHANNELS.CONTENT_EVENTS,
        },
        REEL_CREATED: { 
            eventType: "REEL_CREATED",
            channel: REDIS_CHANNELS.CONTENT_EVENTS,
        },
        REEL_STATUS_CHANGED: {
            eventType: "REEL_STATUS_CHANGED",
            channel: REDIS_CHANNELS.CONTENT_EVENTS,
        },
    },
} as const satisfies ModuleMessagingManifest;
