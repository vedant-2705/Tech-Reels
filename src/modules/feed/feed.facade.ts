/**
 * @module modules/feed/feed.facade
 * @description
 * Façade for triggering feed build operations from other modules.
 * Callers express business intent — Feed decides how to fulfil it.
 *
 * Consumers: Auth, Users, Reels (feed sub-service, search sub-service)
 */

import { Injectable } from "@nestjs/common";
import { MessagingService } from "@modules/messaging";
import { FEED_MANIFEST } from "./feed.messaging";
import { FeedBuildJobPayload } from "./feed.interface";
import { FEED_JOB_REASONS } from "./feed.constants";
import { FeedFacade } from "./feed.facade.abstract";

@Injectable()
export class FeedFacadeImpl extends FeedFacade {
    constructor(private readonly messagingService: MessagingService) {
        super();
    }

    /** @inheritdoc */
    triggerNewUserBuild(userId: string): void {
        this.dispatch(
            userId,
            FEED_JOB_REASONS.NEW_USER,
            FEED_MANIFEST.jobs.NEW_USER_REGISTERED.jobName,
        );
    }

    /** @inheritdoc */
    triggerRebuild(userId: string): void {
        this.dispatch(
            userId,
            FEED_JOB_REASONS.REBUILD,
            FEED_MANIFEST.jobs.FEED_REBUILD.jobName,
        );
    }

    /** @inheritdoc */
    triggerOnboardingBuild(userId: string): void {
        this.dispatch(
            userId,
            FEED_JOB_REASONS.NEW_USER,
            FEED_MANIFEST.jobs.NEW_USER_REGISTERED.jobName,
        );
    }

    /** @inheritdoc */
    triggerColdStart(userId: string): void {
        this.dispatch(
            userId,
            FEED_JOB_REASONS.COLD_START,
            FEED_MANIFEST.jobs.FEED_COLD_START.jobName,
        );
    }

    /** @inheritdoc */
    triggerSearchBuild(userId: string): void {
        this.dispatch(
            userId,
            FEED_JOB_REASONS.SEARCH,
            FEED_MANIFEST.jobs.FEED_SEARCH.jobName,
        );
    }

    /** @inheritdoc */
    triggerShareBuild(userId: string): void {
        this.dispatch(
            userId,
            FEED_JOB_REASONS.SHARE,
            FEED_MANIFEST.jobs.FEED_SHARE.jobName,
        );
    }

    /**
     * Wraps dispatching a feed build job with the appropriate payload and metadata.
     * @param userId ID of the user for whom to build the feed
     * @param reason Reason for triggering the feed build
     * @param jobName Name of the job to dispatch, used to route to the correct queue and worker
     */
    private dispatch(userId: string, reason: string, jobName: string): void {
        const payload: FeedBuildJobPayload = { userId, reason };
        void this.messagingService.dispatchJob(jobName, payload);
    }
}
