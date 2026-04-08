export abstract class FeedFacade {
    /**
     * Rebuilds the feed for the specified user.
     * @param userId ID of the user whose feed is to be rebuilt
     * @param reason Reason for feed rebuild, used for logging and analytics
     */
    abstract feedRebuild(userId: string, reason: string): void;

    /**
     * Triggers a cold start for the specified user.
     * @param userId ID of the user for whom to trigger the cold start feed build
     */
    abstract feedColdStart(userId: string): void;

    /**
     * Searches the feed for the specified user.
     * @param userId ID of the user performing the search
     * @param tagIds Tag IDs to search for in the feed, used to build a search-based feed
     */
    abstract feedSearch(userId: string, tagIds: string[]): void;
}