/**
 * @module modules/notification/notification.module
 * @description
 * NestJS module for handling notifications across the application.
 * This is an event-driven module with NO HTTP controller.
 *
 * Pattern:
 *   - Other modules call NotificationService.enqueueNotification() to enqueue jobs
 *   - NotificationProcessorWorker consumes jobs from notification_queue
 *   - Handlers format notifications (using factory/strategy pattern)
 *   - EmailService and PushService send via appropriate channels
 *
 * Exports:
 *   NotificationService - for other modules to enqueue notifications
 *
 * Queues:
 *   NOT registered here - QueuesModule is @Global() and already registers all queues.
 *   Worker uses @Processor(QUEUES.NOTIFICATION) from global registration.
 */

import { Module } from '@nestjs/common';

import { NotificationService } from './notification.service';
import { EmailService } from './services/email.service';
import { PushService } from './services/push.service';
import { NotificationProcessorWorker } from './workers/notification-processor.worker';

import { AdminMessageHandler } from './handlers/admin-message.handler';
import { PathCompletedHandler } from './handlers/path-completed.handler';
import { WelcomeEmailHandler } from './handlers/welcome-email.handler';
import { MessagingModule } from '@modules/messaging';

@Module({
  imports: [MessagingModule],
  providers: [
    // Core service
    NotificationService,

    // Low-level services (send actual notifications)
    EmailService,
    PushService,

    // Handlers (format notifications based on type)
    AdminMessageHandler,
    PathCompletedHandler,
    WelcomeEmailHandler,

    // Worker (processes jobs from queue)
    NotificationProcessorWorker,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
