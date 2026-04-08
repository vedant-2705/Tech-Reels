/**
 * @module modules/notification/notification.messaging
 * @description
 * Messaging manifest for the Notification module.
 *
 * Notification owns every job that lands in QUEUES.NOTIFICATION.
 * Other modules (Auth, Admin, SkillPaths) dispatch to this queue ONLY
 * through NotificationService façade methods — they never reference
 * these job name strings directly.
 *
 * Ownership rule:
 *   The module whose WORKER consumes a job owns the job name string.
 *   NotificationProcessorWorker consumes all jobs declared here.
 */

import { ModuleMessagingManifest } from "@modules/messaging/messaging.types";
import { QUEUES } from "src/queues/queue-names";

export const NOTIFICATION_MANIFEST = {
    jobs: {
        /**
         * Sent by Admin when taking action against a user (suspend, ban, warn,
         * reel disabled). Payload: { userId, meta: { reason?, note? } }
         */
        ADMIN_MESSAGE: {
            jobName: "admin_message",
            queue: QUEUES.NOTIFICATION,
        },

        /**
         * Sent after new user registration (email or OAuth).
         * Payload: { userId, meta: {} }
         */
        WELCOME_EMAIL: {
            jobName: "welcome_email",
            queue: QUEUES.NOTIFICATION,
        },

        /**
         * Sent after a user completes a skill path.
         * Payload: { userId, meta: { path_id, path_title, certificate_url?, is_first } }
         */
        PATH_COMPLETED: {
            jobName: "path_completed",
            queue: QUEUES.NOTIFICATION,
        },
    },
} as const satisfies ModuleMessagingManifest;
