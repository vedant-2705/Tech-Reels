/**
 * @module modules/notification/entities/notification.entity
 * @description
 * Type definitions for notification queue jobs and notification payloads.
 */

import { NotificationChannel } from '../notification.constants';



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
