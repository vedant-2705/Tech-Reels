/**
 * @module modules/skill-paths/skill-paths.interface
 * @description
 * Payload type contracts for the Skill Paths module.
 *
 * XpAwardJobPayload and BadgeEvaluationJobPayload are owned by Gamification.
 * Skill Paths imports them from there:
 *
 *   import { XpAwardJobPayload, BadgeEvaluationJobPayload }
 *     from '@modules/gamification/gamification.interface';
 */

// ---------------------------------------------------------------------------
// Pub/Sub event payload published by Skill Paths (gamification_events channel)
// Subscribed by: Gamification (awards XP on PATH_COMPLETED)
// ---------------------------------------------------------------------------

export interface PathCompletedEventPayload {
    userId: string;
    pathId: string;
    /**
     * XP amount is decided by SkillPaths (it owns the path reward config).
     * Gamification subscriber reads this to know how much XP to award.
     */
    xp_amount: number;
}

// ---------------------------------------------------------------------------
// Notification job payload dispatched by Skill Paths
// Consumed by: NotificationWorker
// ---------------------------------------------------------------------------

export interface SkillPathNotificationJobPayload {
    userId: string;
    pathId: string;
    /** Notification type - matches NOTIFICATION_TYPES in notification.constants.ts */
    type: string;
}
