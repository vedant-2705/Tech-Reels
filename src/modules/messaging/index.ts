// Module & Service
export { MessagingModule } from "./messaging.module";
export { MessagingService } from "./messaging.service";

// Base classes for workers and subscribers
export { BaseWorker } from "./base.worker";
export { BaseSubscriber } from "./base.subscriber";

// Envelope types
export type { AppMessage, AppMessageMetadata } from "./messaging.interface";

// Job payload types
export type {
    WelcomeEmailJobPayload,
    NewUserJobPayload,
    RebuildFeedJobPayload,
    FeedColdStartJobPayload,
    ProcessVideoJobPayload,
    XpAwardJobPayload,
    BadgeEvaluationJobPayload,
    UpdateUserStreakJobPayload,
    WeeklyLeaderboardResetJobPayload,
    StreakResetJobPayload,
    SendNotificationJobPayload,
    SkillPathXpAwardJobPayload,
    SkillPathBadgeEvaluationJobPayload,
    SkillPathNotificationJobPayload,
    ChallengesXpAwardJobPayload,
    ChallengesBadgeEvaluationJobPayload,
} from "./messaging.interface";

// Event payload types
export type {
    FeedLowEventPayload,
    ReelDeletedEventPayload,
    ReelStatusChangedEventPayload,
    TagUpdatedEventPayload,
    ReelWatchEndedEventPayload,
    PathCompletedEventPayload,
    XpAwardedEventPayload,
    BadgeEarnedEventPayload,
    ChallengeCorrectEventPayload,
} from "./messaging.interface";

// Constants - job names
export {
    AUTH,
    // USERS,
    REELS,
    SKILL_PATH_QUEUE_JOBS,
    CHALLENGES_QUEUE_JOBS,
    GAMIFICATION_QUEUE_JOBS,
    NOTIFICATION_QUEUE_JOBS,
} from "./messaging.constants";

// Constants - event types
export {
    FEED_EVENTS,
    VIDEO_TELEMETRY_EVENTS,
    USER_INTERACTION_EVENTS,
    GAMIFICATION_EVENTS,
} from "./messaging.constants";

// Constants - channel names (only subscribers need these)
export { REDIS_CHANNELS } from "./messaging.constants";

// Constants - job options
export { DEFAULT_JOB_OPTIONS } from "./messaging.constants";

export * from "./messaging.constants";
