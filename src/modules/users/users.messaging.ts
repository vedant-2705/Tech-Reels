/**
 * @module modules/users/users.messaging
 * @description
 * Messaging manifest for the Users module.
 *
 * Note: NEW_USER shares the string "new_user" with AUTH_MANIFEST.NEW_USER
 * and targets the same queue (FEED_BUILD). The registry deduplicates safely
 * since the jobName string and queue are identical — no collision.
 */

import { ModuleMessagingManifest } from "@modules/messaging/messaging.types";
import { REDIS_CHANNELS } from "@modules/messaging/messaging.constants";
import { QUEUES } from "src/queues/queue-names";

export const USERS_MANIFEST = {
    jobs: {
        REBUILD_FEED: {
            jobName: "rebuild",
            queue: QUEUES.FEED_BUILD,
        },
        NEW_USER: {
            jobName: "new_user",
            queue: QUEUES.FEED_BUILD,
        },
    },
    events: {
        ACCOUNT_DEACTIVATED: {
            eventType: "ACCOUNT_DEACTIVATED",
            channel: REDIS_CHANNELS.TRANSACTIONAL,
        },
    },
} as const satisfies ModuleMessagingManifest;
