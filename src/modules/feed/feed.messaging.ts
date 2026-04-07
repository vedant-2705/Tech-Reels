/**
 * @module modules/feed/feed.messaging
 * @description
 * Messaging manifest for the Feed module.
 */

import { ModuleMessagingManifest } from "@modules/messaging/messaging.types";
import { QUEUES } from "src/queues/queue-names";

export const FEED_MANIFEST = {
    jobs: {
        AFFINITY_UPDATE: {
            jobName: "affinity_update",
            queue: QUEUES.AFFINITY_UPDATE,
        },
        FEED_LOW_REBUILD: {
            jobName: "feed_low",
            queue: QUEUES.FEED_BUILD,
        },
    },
} as const satisfies ModuleMessagingManifest;
