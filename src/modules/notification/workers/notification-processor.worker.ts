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

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUES } from '@queues/queue-names';
import { NOTIFICATION_QUEUE_JOBS, NOTIFICATION_CHANNELS } from '../notification.constants';
import { NotificationJobPayload } from '../entities/notification.entity';
import { NotificationHandlerFactory } from '../handlers/notification-handler.factory';
import { EmailService } from '../services/email.service';
import { PushService } from '../services/push.service';

/**
 * Worker that processes notification jobs from notification_queue.
 */
@Processor(QUEUES.NOTIFICATION)
export class NotificationProcessorWorker extends WorkerHost {
    private readonly logger = new Logger(NotificationProcessorWorker.name);

    constructor(
        private readonly handlerFactory: NotificationHandlerFactory,
        private readonly emailService: EmailService,
        private readonly pushService: PushService,
    ) {
        super();
    }

    /**
     * Dispatches incoming jobs based on the job name.
     * @param job BullMQ job with name and payload
     */
    async process(job: Job<NotificationJobPayload>): Promise<void> {
        this.logger.debug(
            `[NotificationProcessorWorker] Processing job ${job.id} name=${job.name} type=${job.data.type} userId=${job.data.userId}`,
        );

        switch (job.name) {
            case NOTIFICATION_QUEUE_JOBS.SEND_NOTIFICATION:
                await this.handleNotification(job.data);
                break;

            default:
                this.logger.warn(
                    `[NotificationProcessorWorker] Unknown job name "${job.name}" - skipping.`,
                );
        }
    }

    /**
     * Process a notification job: get handler, format message, send via appropriate channels.
     */
    private async handleNotification(payload: NotificationJobPayload): Promise<void> {
        try {
            // Get handler for this notification type
            const handler = this.handlerFactory.getHandler(payload.type);

            // Handler processes notification and returns formatted message
            const notification = await handler.handle(payload);
            if (!notification) {
                this.logger.debug(
                    `[NotificationProcessorWorker] Handler returned null - skipping notification for user ${payload.userId}`,
                );
                return;
            }

            // Send via appropriate channels
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
                `[NotificationProcessorWorker] Successfully sent ${notification.channel} notification for user ${payload.userId} (type: ${payload.type})`,
            );
        } catch (error) {
            this.logger.error(
                `[NotificationProcessorWorker] Error processing notification for user ${payload.userId}: ${error}`,
                error instanceof Error ? error.stack : undefined,
            );
            // Don't rethrow - let BullMQ handle retry logic
            // Notifications are best-effort
        }
    }
}
