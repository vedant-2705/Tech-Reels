/**
 * @module modules/notification/registry/notification.registry
 * @description
 * Self-registering dispatch registry for notification handlers.
 * Mirrors FeedEventRegistry and ReelEventRegistry patterns.
 *
 * Each handler file calls NotificationRegistry.register() at module scope.
 * NotificationProcessorWorker imports the handler files to trigger registration.
 *
 * Adding a new notification type:
 *   1. Create a handler extending NotificationHandler.
 *   2. Call NotificationRegistry.register() at the bottom of that file.
 *   3. Import the handler file in notification-processor.worker.ts.
 *   Nothing else changes.
 */

import { Logger } from "@nestjs/common";
import { NotificationHandler } from "../handlers/notification.handler";

const logger = new Logger("NotificationRegistry");

/**
 * Static registry mapping job name strings to NotificationHandler constructors.
 * Key = job.name = notification type (e.g. "welcome_email", "admin_message").
 */
export class NotificationRegistry {
    private static readonly registry = new Map<string, NotificationHandler>();

    /**
     * Register a handler instance for a notification job name.
     * Called by each handler file at module scope (self-registration).
     *
     * @param jobName  The job.name string this handler processes.
     * @param handler  The handler instance.
     */
    static register(jobName: string, handler: NotificationHandler): void {
        if (NotificationRegistry.registry.has(jobName)) {
            logger.warn(
                `Handler already registered for jobName="${jobName}" - overwriting.`,
            );
        }
        NotificationRegistry.registry.set(jobName, handler);
        logger.debug(`Registered handler for jobName="${jobName}"`);
    }

    /**
     * Get the handler for a given job name.
     * Returns undefined if no handler is registered - caller decides how to handle.
     */
    static get(jobName: string): NotificationHandler | undefined {
        return NotificationRegistry.registry.get(jobName);
    }

    static has(jobName: string): boolean {
        return NotificationRegistry.registry.has(jobName);
    }
}
