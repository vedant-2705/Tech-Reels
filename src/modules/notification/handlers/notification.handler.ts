/**
 * @module modules/notification/handlers/notification.handler
 * @description
 * Abstract base handler interface for processing different notification types.
 * Implements the Strategy pattern - allows plugging in different handlers for different notification types.
 */

import { ProcessedNotification } from "../entities/notification.entity";
import { NotificationJobPayload } from "../notification.interface";

/**
 * Strategy interface for handling a specific notification type.
 * Each notification type (admin_message, path_completed, etc.) has its own handler.
 */
export abstract class NotificationHandler {
    /**
     * Process the notification: resolve user data, format message.
     * @param payload The job payload from the queue
     * @returns Processed notification ready to send, or null if should skip
     */
    abstract handle(
        payload: NotificationJobPayload,
    ): Promise<ProcessedNotification | null>;
}
