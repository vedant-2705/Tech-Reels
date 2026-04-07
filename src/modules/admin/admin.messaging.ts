/**
 * @module modules/admin/admin.messaging
 * @description
 * Messaging manifest for the Admin module.
 * Admin dispatches notification jobs (admin messages to users).
 * No pub/sub events published directly.
 *
 * Note: Admin uses NOTIFICATION_MANIFEST.jobs.SEND_NOTIFICATION's job name
 * string, but declares it here explicitly so the registry has a clear owner.
 * The registry deduplicates safely since jobName + queue are identical.
 */

import { GAMIFICATION_MANIFEST } from "@modules/gamification/gamification.messaging";
import { ModuleMessagingManifest } from "@modules/messaging/messaging.types";
import { QUEUES } from "src/queues/queue-names";

export const ADMIN_MANIFEST = {
    jobs: {
        SEND_NOTIFICATION: {
            jobName: "send_notification",
            queue: QUEUES.NOTIFICATION,
        },
        ADMIN_MESSAGE: {
            jobName: "admin_message",
            queue: QUEUES.NOTIFICATION,
        },
        XP_AWARD: GAMIFICATION_MANIFEST.jobs.XP_AWARD,
    },
} as const satisfies ModuleMessagingManifest;
