/**
 * @module modules/notification/services/push.service
 * @description
 * Stub implementation for push notifications.
 * Currently logs to terminal instead of sending actual push notifications.
 */

import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  /**
   * Send push notification
   * @param userId - Target user ID
   * @param title - Notification title
   * @param message - Notification message
   */
  async send(userId: string, title: string, message: string): Promise<void> {
    this.logger.log('========================================');
    this.logger.log('PUSH NOTIFICATION SENT');
    this.logger.log('========================================');
    this.logger.log(`User ID: ${userId}`);
    this.logger.log(`Title: ${title}`);
    this.logger.log(`Message: ${message}`);
    this.logger.log('========================================');
    // TODO: Implement actual push notifications (e.g., using Firebase Cloud Messaging, APNs, etc.)
  }
}
