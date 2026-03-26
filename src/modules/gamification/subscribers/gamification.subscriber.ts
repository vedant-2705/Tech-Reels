/**
 * @module modules/gamification/subscribers/gamification.subscriber
 * @description
 * Redis Pub/Sub subscriber for the Gamification module.
 * Listens on video_telemetry and content_events channels and enqueues
 * BullMQ jobs in response to relevant events.
 *
 * CRITICAL: Uses redisService.client.duplicate() for the subscriber
 * connection. Never call .subscribe() on the shared RedisService.client -
 * ioredis enters a dedicated subscriber mode on that connection which
 * blocks all other commands (get, set, publish, etc.).
 *
 * Channels subscribed:
 *   video_telemetry  -> REEL_WATCH_ENDED
 *   content_events   -> PATH_COMPLETED
 *
 * On REEL_WATCH_ENDED:
 *   1. Enqueue xp_award_queue job  (source: reel_watch)
 *   2. Enqueue streak_reset_queue  (update user streak)
 *   3. Publish REEL_WATCH_ENDED handling is complete - reels module
 *      already published the event, gamification owns side effects.
 *
 * On PATH_COMPLETED:
 *   1. Enqueue xp_award_queue job (source: path_completed)
 *   2. Enqueue badge_evaluation_queue job
 *
 * Fire-and-forget queue.add() for all non-critical side effects
 * (per Foundation doc Section 16).
 */

import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { RedisService } from "@redis/redis.service";
import { QUEUES } from "@queues/queue-names";
import {
    VIDEO_TELEMETRY_CHANNEL,
    CONTENT_EVENTS_CHANNEL,
    GAMIFICATION_INBOUND_EVENTS,
    GAMIFICATION_XP_JOBS,
    GAMIFICATION_BADGE_JOBS,
    GAMIFICATION_STREAK_JOBS,
    XP_SOURCE,
    REEL_WATCH_XP_REWARD,
} from "../gamification.constants";

// ---------------------------------------------------------------------------
// Inbound event payload shapes (published by other modules)
// ---------------------------------------------------------------------------

interface ReelWatchEndedPayload {
    event: string;
    userId: string;
    reelId: string;
    watch_duration_secs: number;
    completion_pct: number;
    timestamp: string;
}

interface PathCompletedPayload {
    event: string;
    userId: string;
    pathId: string;
    xp_amount: number;
    timestamp: string;
}

/**
 * Subscribes to Redis Pub/Sub channels and enqueues gamification jobs.
 * Lifecycle: connects on module init, disconnects on module destroy.
 */
@Injectable()
export class GamificationSubscriber implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(GamificationSubscriber.name);

    /**
     * Dedicated ioredis connection for subscribing.
     * Duplicated from the shared client so the shared connection
     * remains available for get/set/publish operations.
     */
    private subscriberClient!: Redis;

    /**
     * @param redisService         Shared Redis service (used for .client.duplicate()).
     * @param xpAwardQueue         xp_award_queue - receives reel_watch and path_completed XP jobs.
     * @param badgeEvaluationQueue badge_evaluation_queue - receives badge check jobs.
     * @param streakResetQueue     streak_reset_queue - receives per-user streak update jobs.
     */
    constructor(
        private readonly redisService: RedisService,
        @InjectQueue(QUEUES.XP_AWARD)
        private readonly xpAwardQueue: Queue,
        @InjectQueue(QUEUES.BADGE_EVALUATION)
        private readonly badgeEvaluationQueue: Queue,
        @InjectQueue(QUEUES.STREAK_RESET)
        private readonly streakResetQueue: Queue,
    ) {}

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    /**
     * Duplicates the shared Redis connection, subscribes to channels,
     * and registers the message handler.
     * Called automatically by NestJS on module init.
     */
    async onModuleInit(): Promise<void> {
        // Duplicate creates a new connection with the same config.
        // This connection is dedicated to subscribe mode only.
        this.subscriberClient = this.redisService.client.duplicate();

        this.subscriberClient.on("error", (err: Error) => {
            this.logger.error(
                `[GamificationSubscriber] Redis subscriber error: ${err.message}`,
            );
        });

        await this.subscriberClient.subscribe(
            VIDEO_TELEMETRY_CHANNEL,
            CONTENT_EVENTS_CHANNEL,
        );

        this.subscriberClient.on(
            "message",
            (channel: string, message: string) => {
                void this.handleMessage(channel, message);
            },
        );

        this.logger.log(
            `[GamificationSubscriber] Subscribed to channels: ${VIDEO_TELEMETRY_CHANNEL}, ${CONTENT_EVENTS_CHANNEL}`,
        );
    }

    /**
     * Gracefully disconnects the subscriber connection on module destroy.
     */
    async onModuleDestroy(): Promise<void> {
        await this.subscriberClient.quit();
        this.logger.log(
            "[GamificationSubscriber] Subscriber connection closed.",
        );
    }

    // -------------------------------------------------------------------------
    // Message routing
    // -------------------------------------------------------------------------

    /**
     * Routes incoming Pub/Sub messages to the appropriate handler.
     * Errors in individual handlers are caught and logged - a bad message
     * must never crash the subscriber loop.
     *
     * @param channel Redis channel the message arrived on.
     * @param message Raw JSON string published by the source module.
     */
    private async handleMessage(
        channel: string,
        message: string,
    ): Promise<void> {
        let parsed: Record<string, unknown>;

        try {
            parsed = JSON.parse(message) as Record<string, unknown>;
        } catch {
            this.logger.warn(
                `[GamificationSubscriber] Failed to parse message on channel "${channel}": ${message}`,
            );
            return;
        }

        const event = parsed["event"] as string | undefined;
        if (!event) return;

        try {
            if (
                channel === VIDEO_TELEMETRY_CHANNEL &&
                event === GAMIFICATION_INBOUND_EVENTS.REEL_WATCH_ENDED
            ) {
                await this.handleReelWatchEnded(
                    parsed as unknown as ReelWatchEndedPayload,
                );
                return;
            }

            if (
                channel === CONTENT_EVENTS_CHANNEL &&
                event === GAMIFICATION_INBOUND_EVENTS.PATH_COMPLETED
            ) {
                await this.handlePathCompleted(
                    parsed as unknown as PathCompletedPayload,
                );
                return;
            }

            // Event on a subscribed channel but not handled by this module - ignore
        } catch (err) {
            this.logger.error(
                `[GamificationSubscriber] Error handling event "${event}" on channel "${channel}": ${(err as Error).message}`,
            );
        }
    }

    // -------------------------------------------------------------------------
    // Event handlers
    // -------------------------------------------------------------------------

    /**
     * Handles REEL_WATCH_ENDED from video_telemetry channel.
     *
     * Side effects enqueued (fire-and-forget):
     *   1. xp_award_queue  - award REEL_WATCH_XP_REWARD XP for reel_watch source.
     *   2. streak_reset_queue - update user's daily streak.
     *
     * Note: badge evaluation is NOT triggered on reel_watch events.
     * Badge criteria are currently challenge-driven only.
     * Add badge evaluation here when reel-watch badges are introduced.
     *
     * @param payload Parsed REEL_WATCH_ENDED event payload.
     */
    private async handleReelWatchEnded(
        payload: ReelWatchEndedPayload,
    ): Promise<void> {
        const { userId, reelId } = payload;

        this.logger.debug(
            `[GamificationSubscriber] REEL_WATCH_ENDED: userId=${userId} reelId=${reelId}`,
        );

        // Enqueue XP award for reel watch
        void this.xpAwardQueue.add(
            GAMIFICATION_XP_JOBS.XP_AWARD,
            {
                userId,
                source: XP_SOURCE.REEL_WATCH,
                xp_amount: REEL_WATCH_XP_REWARD,
                reference_id: reelId,
            },
            { removeOnComplete: 100, removeOnFail: 200 },
        );

        // Enqueue per-user streak update - distinct job name from the daily
        // batch reset so the worker can route them to different handlers.
        void this.streakResetQueue.add(
            GAMIFICATION_STREAK_JOBS.UPDATE_USER_STREAK,
            { userId },
            { removeOnComplete: 100, removeOnFail: 200 },
        );

        // Enqueue badge evaluation for path completion event
        void this.badgeEvaluationQueue.add(
            GAMIFICATION_BADGE_JOBS.BADGE_EVALUATION,
            {
                userId,
                event: GAMIFICATION_INBOUND_EVENTS.REEL_WATCH_ENDED,
                meta: { reelId },
            },
            { removeOnComplete: 100, removeOnFail: 200 },
        );
    }

    /**
     * Handles PATH_COMPLETED from content_events channel.
     *
     * Side effects enqueued (fire-and-forget):
     *   1. xp_award_queue         - award XP for path_completed source.
     *   2. badge_evaluation_queue - evaluate path-completion badges.
     *
     * xp_amount is provided by the skill-paths module in the event payload
     * since it owns the path XP reward configuration.
     *
     * @param payload Parsed PATH_COMPLETED event payload.
     */
    private async handlePathCompleted(
        payload: PathCompletedPayload,
    ): Promise<void> {
        const { userId, pathId, xp_amount } = payload;

        this.logger.debug(
            `[GamificationSubscriber] PATH_COMPLETED: userId=${userId} pathId=${pathId}`,
        );

        // Enqueue XP award for path completion
        void this.xpAwardQueue.add(
            GAMIFICATION_XP_JOBS.XP_AWARD,
            {
                userId,
                source: XP_SOURCE.PATH_COMPLETED,
                xp_amount,
                reference_id: pathId,
            },
            { removeOnComplete: 100, removeOnFail: 200 },
        );

        // Enqueue badge evaluation for path completion event
        void this.badgeEvaluationQueue.add(
            GAMIFICATION_BADGE_JOBS.BADGE_EVALUATION,
            {
                userId,
                event: GAMIFICATION_INBOUND_EVENTS.PATH_COMPLETED,
                meta: { pathId },
            },
            { removeOnComplete: 100, removeOnFail: 200 },
        );
    }
}
