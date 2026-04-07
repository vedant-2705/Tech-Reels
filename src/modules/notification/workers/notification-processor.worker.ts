/**
 * @module modules/notification/workers/notification-processor.worker
 * @description
 * BullMQ processor for the notification_queue.
 * Consumes { type, userId, meta } job payloads and delegates to appropriate handler.
 *
 * Workflow:
 *   1. Use factory to get handler for notification type
 *   2. Handler processes notification (formats message, resolves user email)
 *   3. Send via email service and/or push service based on channel
 *   4. Log results
 *
 * Retry behaviour: BullMQ retries failed jobs automatically.
 * Notifications are fire-and-forget; errors are logged but don't fail the entire job.
 */

import { Processor } from "@nestjs/bullmq";
import { Job } from "bullmq";

import { BaseWorker } from "@modules/messaging";
import { QUEUES } from "@queues/queue-names";

import { EmailService } from "../services/email.service";
import { PushService } from "../services/push.service";

import { NOTIFICATION_CHANNELS } from "../notification.constants";
import { NotificationRegistry } from "../registry/notification.registry";
import { NotificationJobPayload } from "../notification.interface";

// ---------------------------------------------------------------------------
// Self-registering imports
// Importing each file triggers its NotificationRegistry.register() side effect.
// Add one import line here when adding a new handler - nothing else changes.
// ---------------------------------------------------------------------------
import "../handlers/welcome-email.handler";
import "../handlers/path-completed.handler";
import "../handlers/admin-message.handler";

/**
 * Worker that processes notification jobs from notification_queue.
 */
@Processor(QUEUES.NOTIFICATION)
export class NotificationProcessorWorker extends BaseWorker<NotificationJobPayload> {
    constructor(
        private readonly emailService: EmailService,
        private readonly pushService: PushService,
    ) {
        super();
    }

    /**
     * Dispatches incoming jobs based on the job name.
     * @param payload Unwrapped payload from BaseWorker.
     * @param job BullMQ job with name and payload
     */
    async handle(payload: NotificationJobPayload, job: Job): Promise<void> {
        const handler = NotificationRegistry.get(job.name);
        if (!handler) {
            this.logger.warn(
                `No handler registered for job.name="${job.name}" - skipping. ` +
                    `Import the handler file in notification-processor.worker.ts.`,
            );
            return;
        }

        this.logger.debug(
            `Processing notification job=${job.id} name="${job.name}" userId=${payload.userId}`,
        );

        try {
            const notification = await handler.handle(payload);

            if (!notification) {
                this.logger.debug(
                    `Handler returned null for job.name="${job.name}" userId=${payload.userId} - skipping send`,
                );
                return;
            }

            if (
                notification.channel === NOTIFICATION_CHANNELS.EMAIL ||
                notification.channel === NOTIFICATION_CHANNELS.BOTH
            ) {
                await this.emailService.send(
                    notification.email,
                    notification.subject,
                    notification.message,
                );
            }

            if (
                notification.channel === NOTIFICATION_CHANNELS.PUSH ||
                notification.channel === NOTIFICATION_CHANNELS.BOTH
            ) {
                await this.pushService.send(
                    notification.userId,
                    notification.title,
                    notification.message,
                );
            }

            this.logger.debug(
                `Notification sent job.name="${job.name}" channel=${notification.channel} userId=${payload.userId}`,
            );
        } catch (err) {
            // Notifications are best-effort - log but do not rethrow.
            // BullMQ will retry per DEFAULT_JOB_OPTIONS if needed.
            this.logger.error(
                `Notification failed job.name="${job.name}" userId=${payload.userId}: ${(err as Error).message}`,
            );
        }
    }
}
