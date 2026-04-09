export abstract class FeedFacade {
    /**
     * Builds the feed for a new user.
     * @param userId ID of the new user for whom to build the feed
    */
    abstract triggerNewUserBuild(userId: string): void;
    
    /**
     * Rebuilds the feed for the specified user.
     * @param userId ID of the user whose feed is to be rebuilt
     */
    abstract triggerRebuild(userId: string): void;

    /**
     * Builds the feed for a user completing onboarding.
     * @param userId ID of the user completing onboarding
     */
    abstract triggerOnboardingBuild(userId: string): void;

    /**
     * Triggers a cold start for the specified user.
     * @param userId ID of the user for whom to trigger the cold start feed build
     */
    abstract triggerColdStart(userId: string): void;

    /**
     * Searches the feed for the specified user.
     * @param userId ID of the user performing the search
     */
    abstract triggerSearchBuild(userId: string): void;

    /**
     * Builds the feed for a user after they share a reel.
     * @param userId ID of the user who shared a reel
     */
    abstract triggerShareBuild(userId: string): void;
}
