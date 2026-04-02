/**
 * @module modules/notification/handlers/admin-message.handler
 * @description
 * Handler for admin_message notifications.
 * Sent when admin takes actions against a user (suspend, ban, warn, etc.)
 */

import { Injectable, Logger } from '@nestjs/common';
import { NotificationHandler } from './notification.handler';
import { NotificationJobPayload, ProcessedNotification, AdminMessageMeta } from '../entities/notification.entity';
import { NOTIFICATION_TYPES, NOTIFICATION_CHANNELS } from '../notification.constants';

@Injectable()
export class AdminMessageHandler extends NotificationHandler {
    private readonly logger = new Logger(AdminMessageHandler.name);

    getType() {
        return NOTIFICATION_TYPES.ADMIN_MESSAGE;
    }

    async handle(
        payload: NotificationJobPayload,
    ): Promise<ProcessedNotification | null> {
        const meta = payload.meta as unknown as AdminMessageMeta;

        const subject = 'Important: Your Account Status Update';
        const title = 'Account Update';
        const message = `Your account has been updated by an administrator. 
Reason: ${meta.reason || 'No specific reason provided'}
${meta.note ? `Note: ${meta.note}` : ''}

Please contact support if you have questions.`;

        // Mock: in real implementation, fetch user email from database
        const email = `user_${payload.userId}@example.com`;

        this.logger.debug(
            `[AdminMessageHandler] Processing admin message for user ${payload.userId}`,
        );

        return {
            userId: payload.userId,
            email,
            channel: NOTIFICATION_CHANNELS.BOTH,
            subject,
            title,
            message,
        };
    }
}
