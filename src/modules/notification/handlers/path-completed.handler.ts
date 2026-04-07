/**
 * @module modules/notification/handlers/path-completed.handler
 * @description
 * Handler for path_completed notifications.
 * Sent when a user completes a skill path.
 */

import { Injectable, Logger } from "@nestjs/common";
import { NotificationHandler } from "./notification.handler";
import { ProcessedNotification } from "../entities/notification.entity";
import { NOTIFICATION_CHANNELS } from "../notification.constants";
import { NotificationRegistry } from "../registry/notification.registry";
import {
    NotificationJobPayload,
    PathCompletedMeta,
} from "../notification.interface";

@Injectable()
export class PathCompletedHandler extends NotificationHandler {
    private readonly logger = new Logger(PathCompletedHandler.name);

    async handle(
        payload: NotificationJobPayload,
    ): Promise<ProcessedNotification | null> {
        const meta = payload.meta as unknown as PathCompletedMeta;

        const subject = `Congratulations! You completed "${meta.path_title}"`;
        const title = "Skill Path Completed 🎉";
        const message = `Great job! You've successfully completed the skill path: "${meta.path_title}"
${meta.is_first ? "This is your first completion - you earned a special certificate!" : "You completed this path again!"}
${meta.certificate_url ? `Download your certificate: ${meta.certificate_url}` : ""}`;

        // Mock: in real implementation, fetch user email from database
        const email = `user_${payload.userId}@example.com`;

        this.logger.debug(
            `[PathCompletedHandler] Processing path completion for user ${payload.userId}, path ${meta.path_id}`,
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

// ---------------------------------------------------------------------------
// Self-registration
// jobName "path_completed" matches SKILL_PATHS_MANIFEST.jobs.NOTIFICATION.jobName
// ---------------------------------------------------------------------------
NotificationRegistry.register("path_completed", new PathCompletedHandler());
