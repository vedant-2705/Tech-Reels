/**
 * @module modules/notification/notification.messaging
 * @description
 * Messaging manifest for the Notification module.
 *
 * The notification module is primarily a consumer (processes notification_queue jobs).
 * It declares SEND_NOTIFICATION here because Admin module dispatches jobs
 * using this job name, and the registry must know it targets QUEUES.NOTIFICATION.
 *
 * No pub/sub events published by this module.
 */

import { ModuleMessagingManifest } from "@modules/messaging/messaging.types";
import { QUEUES } from "src/queues/queue-names";

export const NOTIFICATION_MANIFEST = {
    jobs: {
        SEND_NOTIFICATION: {
            jobName: "send_notification",
            queue: QUEUES.NOTIFICATION,
        },
    },
} as const satisfies ModuleMessagingManifest;
