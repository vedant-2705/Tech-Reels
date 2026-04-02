/**
 * @module modules/notification/services/email.service
 * @description
 * Stub implementation for email notifications.
 * Currently logs to terminal instead of sending actual emails.
 */

import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  /**
   * Send email notification
   * @param to - Recipient email address
   * @param subject - Email subject
   * @param body - Email body content
   */
  async send(to: string, subject: string, body: string): Promise<void> {
    this.logger.log('========================================');
    this.logger.log('EMAIL NOTIFICATION SENT');
    this.logger.log('========================================');
    this.logger.log(`To: ${to}`);
    this.logger.log(`Subject: ${subject}`);
    this.logger.log(`Body: ${body}`);
    this.logger.log('========================================');
    // TODO: Implement actual email sending (e.g., using SendGrid, AWS SES, etc.)
  }
}
