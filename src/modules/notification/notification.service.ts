/**
 * @module modules/notification/notification.service
 * @description
 * Façade service for the Notification module.
 *
 * Callers (Admin, Auth, SkillPaths) inject this service and call
 * typed methods — they never reference job names, queue names, or
 * manifests directly. All dispatch details are encapsulated here.
 *
 * Internally delegates to MessagingService, which owns envelope
 * construction, queue resolution, and retry defaults.
 *
 * Exported methods:
 *   enqueueAdminMessage()  - admin action against a user (suspend, ban, warn)
 *   enqueueWelcomeEmail()  - new user registered (email or OAuth)
 *   enqueuePathCompleted() - user completed a skill path
 */

import { Injectable, Logger } from "@nestjs/common";

import { MessagingService } from "@modules/messaging";
import { NOTIFICATION_MANIFEST } from "./notification.messaging";
import {
    AdminMessageJobPayload,
    AdminMessageMeta,
    NotificationJobPayload,
    PathCompletedJobPayload,
    PathCompletedMeta,
} from "./notification.interface";

@Injectable()
export class NotificationService {
    private readonly logger = new Logger(NotificationService.name);

    constructor(private readonly messagingService: MessagingService) {}

    // -------------------------------------------------------------------------
    // Public façade API
    // Callers depend on these methods — never on job name strings.
    // -------------------------------------------------------------------------

    /**
     * Enqueue an admin-message notification to a user.
     * Called by AdminService when suspending, banning, or warning a user,
     * and when disabling a reel (notifying the creator).
     *
     * @param userId  Target user UUID.
     * @param meta    Reason and optional note from the admin action.
     */
    async enqueueAdminMessage(
        userId: string,
        meta: AdminMessageMeta,
    ): Promise<void> {
        const payload: AdminMessageJobPayload = { userId, meta };

        this.logger.debug(
            `Enqueueing admin_message notification userId=${userId}`,
        );

        void this.messagingService.dispatchJob(
            NOTIFICATION_MANIFEST.jobs.ADMIN_MESSAGE.jobName,
            payload,
        );
    }

    /**
     * Enqueue a welcome-email notification for a newly registered user.
     * Called by AuthService after email or OAuth registration.
     *
     * @param userId  Newly created user UUID.
     */
    async enqueueWelcomeEmail(userId: string): Promise<void> {
        const payload: NotificationJobPayload = { userId, meta: {} };

        this.logger.debug(
            `Enqueueing welcome_email notification userId=${userId}`,
        );

        void this.messagingService.dispatchJob(
            NOTIFICATION_MANIFEST.jobs.WELCOME_EMAIL.jobName,
            payload,
        );
    }

    /**
     * Enqueue a path-completed notification for a user who finished a skill path.
     * Called by SkillPathsService after marking a path as complete.
     *
     * @param userId  User UUID.
     * @param meta    Path details (id, title, certificate URL, is_first flag).
     */
    async enqueuePathCompleted(
        userId: string,
        meta: PathCompletedMeta,
    ): Promise<void> {
        const payload: PathCompletedJobPayload = { userId, meta };

        this.logger.debug(
            `Enqueueing path_completed notification userId=${userId} pathId=${meta.path_id}`,
        );

        void this.messagingService.dispatchJob(
            NOTIFICATION_MANIFEST.jobs.PATH_COMPLETED.jobName,
            payload,
        );
    }
}
