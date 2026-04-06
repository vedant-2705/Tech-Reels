/**
 * @module modules/challenges/challenges.messaging
 * @description
 * Messaging manifest for the Challenges module.
 *
 * Job names are namespaced ("challenges:xp_award", "challenges:badge_evaluation")
 * to avoid registry key collision with GAMIFICATION_MANIFEST which owns the
 * canonical "xp_award" and "badge_evaluation" strings. Both target the same
 * physical queues — workers handle all variants via their switch cases.
 *
 * Inbound events this module SUBSCRIBES to (not declared here): none currently.
 * The challenges service is invoked directly via HTTP — no pub/sub inbound.
 */

import { ModuleMessagingManifest } from "@modules/messaging/messaging.types";
import { REDIS_CHANNELS } from "@modules/messaging/messaging.constants";
import { QUEUES } from "src/queues/queue-names";

export const CHALLENGES_MANIFEST = {
    jobs: {
        XP_AWARD: {
            jobName: "xp_award",
            queue: QUEUES.XP_AWARD,
        },
        BADGE_EVALUATION: {
            jobName: "badge_evaluation",
            queue: QUEUES.BADGE_EVALUATION,
        },
    },
    events: {
        ATTEMPT_SUBMITTED: {
            eventType: "ATTEMPT_SUBMITTED",
            channel: REDIS_CHANNELS.GAMIFICATION_EVENTS,
        },
    },
} as const satisfies ModuleMessagingManifest;
