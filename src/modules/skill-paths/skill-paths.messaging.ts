/**
 * @module modules/skill-paths/skill-paths.messaging
 * @description
 * Messaging manifest for the Skill Paths module.
 *
 * NOTIFICATION job name is "path_completed" - matches SKILL_PATH_QUEUE_JOBS.NOTIFICATION
 * in skill-paths.constants.ts exactly. Previous generated code incorrectly used
 * "skill_path:notification" - this is the corrected value.
 *
 * XP_AWARD and BADGE_EVALUATION are namespaced ("skill_path:*") to avoid
 * registry collision with GAMIFICATION_MANIFEST canonical strings.
 *
 * Inbound events this module SUBSCRIBES to (not declared here):
 *   REEL_WATCH_ENDED <- import from REELS_MANIFEST
 */

import { ModuleMessagingManifest } from "@modules/messaging/messaging.types";
import { REDIS_CHANNELS } from "@modules/messaging/messaging.constants";
import { QUEUES } from "src/queues/queue-names";

export const SKILL_PATHS_MANIFEST = {
    jobs: {
        XP_AWARD: {
            jobName: "xp_award",
            queue: QUEUES.XP_AWARD,
        },
        BADGE_EVALUATION: {
            jobName: "badge_evaluation",
            queue: QUEUES.BADGE_EVALUATION,
        },
        NOTIFICATION: {
            jobName: "path_completed",
            queue: QUEUES.NOTIFICATION,
        },
    },
    events: {
        PATH_COMPLETED: {
            eventType: "PATH_COMPLETED",
            channel: REDIS_CHANNELS.GAMIFICATION_EVENTS,
        },
    },
} as const satisfies ModuleMessagingManifest;
