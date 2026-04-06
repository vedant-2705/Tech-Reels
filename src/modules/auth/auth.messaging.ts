/**
 * @module modules/auth/auth.messaging
 * @description
 * Messaging manifest for the Auth module.
 * Declares every BullMQ job and Redis Pub/Sub event this module emits.
 *
 * Subscribers that listen to auth events import directly from here:
 *   import { AUTH_MANIFEST } from '@modules/auth/auth.messaging';
 *   // then use AUTH_MANIFEST.events.USER_LOGGED_IN.eventType
 */

import { ModuleMessagingManifest } from "@modules/messaging/messaging.types";
import { REDIS_CHANNELS } from "@modules/messaging/messaging.constants";
import { QUEUES } from "src/queues/queue-names";

export const AUTH_MANIFEST = {
    jobs: {
        WELCOME_EMAIL: {
            jobName: "welcome_email",
            queue: QUEUES.NOTIFICATION,
        },
        NEW_USER: {
            jobName: "new_user",
            queue: QUEUES.FEED_BUILD,
        },
    },
    events: {
        USER_REGISTERED: {
            eventType: "USER_REGISTERED",
            channel: REDIS_CHANNELS.TRANSACTIONAL,
        },
        USER_LOGGED_IN: {
            eventType: "USER_LOGGED_IN",
            channel: REDIS_CHANNELS.TRANSACTIONAL,
        },
        USER_LOGGED_OUT: {
            eventType: "USER_LOGGED_OUT",
            channel: REDIS_CHANNELS.TRANSACTIONAL,
        },
    },
} as const satisfies ModuleMessagingManifest;
