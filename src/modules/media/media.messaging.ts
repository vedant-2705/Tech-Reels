/**
 * @module modules/media/media.messaging
 * @description
 * Messaging manifest for the Media module.
 * Media has no queue jobs it dispatches — it consumes the video_processing_queue.
 * It publishes three events to content_events after MediaConvert webhook callbacks.
 *
 * REEL_CREATED is intentionally owned by Media (not Reels) — it is only safe
 * to publish after the reel status becomes `active` in the webhook handler.
 */

import { ModuleMessagingManifest } from "@modules/messaging/messaging.types";
import { REDIS_CHANNELS } from "@modules/messaging/messaging.constants";

export const MEDIA_MANIFEST = {
    events: {
        PROCESSING_COMPLETE: {
            eventType: "PROCESSING_COMPLETE",
            channel: REDIS_CHANNELS.CONTENT_EVENTS,
        },
        PROCESSING_FAILED: {
            eventType: "PROCESSING_FAILED",
            channel: REDIS_CHANNELS.CONTENT_EVENTS,
        },
        REEL_CREATED: {
            eventType: "REEL_CREATED",
            channel: REDIS_CHANNELS.CONTENT_EVENTS,
        },
    },
} as const satisfies ModuleMessagingManifest;
