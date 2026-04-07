/**
 * @module notification/notification.interface
 * @description
 * Type definitions for notification module - job payloads, processed notification shape, etc.
 * These types are used across the module - in handlers, services, and workers.
 */

import { NOTIFICATION_TYPES, NotificationType } from "./notification.constants";

/**
 * Base payload shape for all notification queue jobs.
 * All notifications must have a type and userId.
 * Meta contains type-specific data.
 */

export interface NotificationJobPayload<T extends Record<string, unknown> = Record<string, unknown>> {
    // type: NotificationType;
    userId: string;
    meta: T;
}

export interface AdminMessageMeta extends Record<string, unknown> {
    reason?: string; // e.g. "suspended for 3 days", "warned for inappropriate content", etc.
    note?: string; // Optional freeform note from admin to user
}

export type AdminMessageJobPayload = NotificationJobPayload<AdminMessageMeta>;

/**
 * Path completed notification metadata
 */
export interface PathCompletedMeta extends Record<string, unknown> {
    path_id: string;
    path_title: string;
    certificate_url?: string;
    is_first: boolean;
}

export type PathCompletedJobPayload = NotificationJobPayload<PathCompletedMeta>;


/* Registry */
interface NotificationMetaRegistry {
    [NOTIFICATION_TYPES.ADMIN_MESSAGE]: AdminMessageMeta;
    [NOTIFICATION_TYPES.PATH_COMPLETED]: PathCompletedMeta;
}

export type NotificationMetas = NotificationMetaRegistry[keyof NotificationMetaRegistry];