/**
 * @module modules/notification/entities/notification.entity
 * @description
 * Type definitions for notification queue jobs and notification payloads.
 */

import { NotificationType, NotificationChannel } from '../notification.constants';

/**
 * Base payload shape for all notification queue jobs.
 * All notifications must have a type and userId.
 * Meta contains type-specific data.
 */
export interface NotificationJobPayload {
    type: NotificationType;
    userId: string;
    meta: Record<string, unknown>;
}

/**
 * Processed notification job - after resolving user email and formatting message.
 */
export interface ProcessedNotification {
    userId: string;
    email: string;
    channel: NotificationChannel;
    subject: string;
    title: string;
    message: string;
}

/**
 * Admin message notification metadata
 */
export interface AdminMessageMeta {
    reason?: string;
    note?: string;
}

/**
 * Path completed notification metadata
 */
export interface PathCompletedMeta {
    path_id: string;
    path_title: string;
    certificate_url?: string;
    is_first: boolean;
}

/**
 * Reel liked notification metadata
 */
export interface ReelLikedMeta {
    reel_id: string;
    reel_title: string;
    liker_name: string;
}

/**
 * Challenge completed notification metadata
 */
export interface ChallengeCompletedMeta {
    challenge_id: string;
    challenge_title: string;
    score: number;
}
