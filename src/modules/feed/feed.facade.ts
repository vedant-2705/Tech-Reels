import { MessagingService } from "@modules/messaging";
import { Injectable } from "@nestjs/common";
import { FEED_MANIFEST } from "./feed.messaging";
import { FeedRebuildJobPayload } from "./feed.interface";
import { FeedColdStartJobPayload, FeedSearchJobPayload } from "@modules/reels/reels.interface";
import { FeedFacade } from "./feed.facade.abstract";

@Injectable()
export class FeedFacadeImpl extends FeedFacade {
    constructor(private readonly messagingService: MessagingService) {
        super();
    }

    /** @inheritdoc */
    feedRebuild(userId: string, reason: string): void {
        const payload: FeedRebuildJobPayload = { userId, reason };

        void this.dispatchFeedBuildJob<typeof payload>(
            FEED_MANIFEST.jobs.FEED_REBUILD.jobName,
            payload,
        );
    }

    /** @inheritdoc */
    feedColdStart(userId: string): void {
        const payload: FeedColdStartJobPayload = {
            userId,
            reason: "No reels in feed, triggering cold start",
        };
        void this.dispatchFeedBuildJob<typeof payload>(
            FEED_MANIFEST.jobs.FEED_COLD_START.jobName,
            payload,
        );
    }

    /** @inheritdoc */
    feedSearch(userId: string,  tagIds: string[]): void {
        const payload: FeedSearchJobPayload = {
            userId,
            tagIds,
            reason: "User performed a search, triggering search-based feed build",
        };
        void this.dispatchFeedBuildJob<typeof payload>(
            FEED_MANIFEST.jobs.FEED_SEARCH.jobName,
            payload,
        );
    }

    /**
     * Private helper to dispatch feed build jobs.
     * @param jobName Job name to dispatch, must be one of the feed build job names defined in FEED_MANIFEST
     * @param payload Payload for the job, must match the expected payload type for the specified job name
     */
    private dispatchFeedBuildJob<T>(jobName: string, payload: T): void {
        void this.messagingService.dispatchJob(jobName, payload);
    }
}
