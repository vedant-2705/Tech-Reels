/**
 * @module modules/notification/notification.service
 * @description
 * Application service for the Notification module.
 * Does NOT send notifications directly - instead enqueues jobs to notification_queue
 * for async processing by NotificationProcessorWorker.
 *
 * Responsibilities:
 *   - Enqueue notification jobs with appropriate type and metadata
 *   - Called by other modules when they need to send notifications
 *   - Actual processing delegated to worker and handlers
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { QUEUES } from '@queues/queue-names';
import { NOTIFICATION_QUEUE_JOBS, NotificationType } from './notification.constants';
import { NotificationJobPayload } from './entities/notification.entity';

/**
 * Notification service: enqueues notification jobs.
 * Called by other modules via dependency injection.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectQueue(QUEUES.NOTIFICATION)
    private readonly notificationQueue: Queue,
  ) {}

  /**
   * Enqueue a notification job.
   * Used internally by the module - other modules should call this.
   *
   * @param type The notification type (e.g., "admin_message", "path_completed")
   * @param userId The target user ID
   * @param meta Type-specific metadata (e.g., reason, path_id, etc.)
   */
  async enqueueNotification(
    type: NotificationType,
    userId: string,
    meta: Record<string, unknown>,
  ): Promise<void> {
    const payload: NotificationJobPayload = {
      type,
      userId,
      meta,
    };

    this.logger.debug(
      `[NotificationService] Enqueueing notification job: type=${type} userId=${userId}`,
    );

    // Fire and forget - don't await
    void this.notificationQueue.add(
      NOTIFICATION_QUEUE_JOBS.SEND_NOTIFICATION,
      payload,
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
      },
    );
  }

  /**
   * Send email notification directly (for synchronous use cases).
   * Normally, prefer enqueueNotification() for async handling.
   */
  async sendEmailDirect(to: string, subject: string, body: string): Promise<void> {
    this.logger.log(
      `Sending direct email notification to ${to} with subject: ${subject}`,
    );
    // Direct service calls not implemented - use queue instead
  }

  /**
   * Send push notification directly (for synchronous use cases).
   * Normally, prefer enqueueNotification() for async handling.
   */
  async sendPushDirect(
    userId: string,
    title: string,
    message: string,
  ): Promise<void> {
    this.logger.log(
      `Sending direct push notification to user ${userId} with title: ${title}`,
    );
    // Direct service calls not implemented - use queue instead
  }
}
