/**
 * @module modules/notification/handlers/welcome-email.handler
 * @description
 * Handles "welcome_email" notification jobs.
 * Sent when a new user registers (email or OAuth).
 *
 * Self-registers into NotificationRegistry at module load time.
 * Import this file in notification-processor.worker.ts to activate.
 *
 * jobName: "welcome_email" - matches AUTH_MANIFEST.jobs.WELCOME_EMAIL.jobName
 */

import { Injectable, Logger } from "@nestjs/common";
import { NotificationHandler } from "./notification.handler";
import { NotificationRegistry } from "../registry/notification.registry";
import { ProcessedNotification } from "../entities/notification.entity";
import { NOTIFICATION_CHANNELS } from "../notification.constants";
import { NotificationJobPayload } from "../notification.interface";

@Injectable()
export class WelcomeEmailHandler extends NotificationHandler {
    private readonly logger = new Logger(WelcomeEmailHandler.name);

    async handle(
        payload: NotificationJobPayload,
    ): Promise<ProcessedNotification | null> {
        const subject = "Welcome to the platform!";
        const title = "Welcome 👋";
        const message = `Hi! Your account is ready. Start exploring reels and skill paths today.`;

        // TODO: fetch user email from UsersRepository
        const email = `user_${payload.userId}@example.com`;

        this.logger.debug(
            `Processing welcome_email for userId=${payload.userId}`,
        );

        return {
            userId: payload.userId,
            email,
            channel: NOTIFICATION_CHANNELS.EMAIL,
            subject,
            title,
            message,
        };
    }
}

// ---------------------------------------------------------------------------
// Self-registration
// jobName "welcome_email" matches AUTH_MANIFEST.jobs.WELCOME_EMAIL.jobName
// ---------------------------------------------------------------------------
NotificationRegistry.register("welcome_email", new WelcomeEmailHandler());
