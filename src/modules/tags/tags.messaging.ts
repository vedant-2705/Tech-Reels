/**
 * @module modules/tags/tags.messaging
 * @description
 * Messaging manifest for the Tags module.
 * Tags has no queue jobs - it only publishes one pub/sub event.
 *
 * Subscribers that react to tag updates import from here:
 *   import { TAGS_MANIFEST } from '@modules/tags/tags.messaging';
 */

import { ModuleMessagingManifest } from "@modules/messaging/messaging.types";
import { REDIS_CHANNELS } from "@modules/messaging/messaging.constants";

export const TAGS_MANIFEST = {
    events: {
        TAG_UPDATED: {
            eventType: "TAG_UPDATED",
            channel: REDIS_CHANNELS.CONTENT_EVENTS,
        },
    },
} as const satisfies ModuleMessagingManifest;
