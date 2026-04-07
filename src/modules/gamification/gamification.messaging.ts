/**
 * @module modules/gamification/gamification.messaging
 * @description
 * Messaging manifest for the Gamification module.
 *
 * Gamification owns the canonical "xp_award" and "badge_evaluation" job
 * name strings. Challenges and SkillPaths use namespaced variants
 * ("challenges:xp_award", "skill_path:xp_award") that all target the
 * same physical queues - the XpAwardWorker handles all of them.
 *
 * Inbound events this module SUBSCRIBES to (not declared here):
 *   REEL_WATCH_ENDED  <- import from REELS_MANIFEST
 *   PATH_COMPLETED    <- import from SKILL_PATHS_MANIFEST
 */

import { ModuleMessagingManifest } from "@modules/messaging/messaging.types";
import { REDIS_CHANNELS } from "@modules/messaging/messaging.constants";
import { QUEUES } from "src/queues/queue-names";

export const GAMIFICATION_MANIFEST = {
    jobs: {
        XP_AWARD: {
            jobName: "xp_award",
            queue: QUEUES.XP_AWARD,
        },
        BADGE_EVALUATION: {
            jobName: "badge_evaluation",
            queue: QUEUES.BADGE_EVALUATION,
        },
        WEEKLY_LEADERBOARD_RESET: {
            jobName: "weekly_leaderboard_reset",
            queue: QUEUES.LEADERBOARD_RESET,
        },
        STREAK_RESET: {
            jobName: "streak_reset",
            queue: QUEUES.STREAK_RESET,
        },
        UPDATE_USER_STREAK: {
            jobName: "update_user_streak",
            queue: QUEUES.STREAK_RESET,
        },
    },
    events: {
        XP_AWARDED: {
            eventType: "XP_AWARDED",
            channel: REDIS_CHANNELS.GAMIFICATION_EVENTS,
        },
        BADGE_EARNED: {
            eventType: "BADGE_EARNED",
            channel: REDIS_CHANNELS.GAMIFICATION_EVENTS,
        },
        PATH_COMPLETED: {
            eventType: "PATH_COMPLETED",
            channel: REDIS_CHANNELS.GAMIFICATION_EVENTS,
        },
    },
} as const satisfies ModuleMessagingManifest;
