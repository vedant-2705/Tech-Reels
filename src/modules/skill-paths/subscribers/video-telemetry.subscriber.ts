/**
 * @module modules/skill-paths/subscribers/video-telemetry.subscriber
 * @description
 * Redis pub/sub subscriber for the video_telemetry channel.
 * Listens for REEL_WATCH_ENDED events and drives skill path progress tracking.
 *
 * Connection model:
 *   Uses a DEDICATED subscriber connection (redisService.client.duplicate()).
 *   Subscribing on a shared Redis client blocks it for all other commands - this
 *   is a hard Redis protocol constraint. The duplicate connection is created on
 *   module init and torn down gracefully on module destroy.
 *   The shared RedisService client is only used here for publish() calls,
 *   which is safe and intentional.
 *
 * Failure model:
 *   All errors inside handleMessage are caught and logged. An uncaught error
 *   here would crash the subscriber loop and silently stop all progress tracking.
 *   Per-path processing errors are isolated - a failure on one path does not
 *   prevent processing of other paths from the same watch event.
 *
 * Idempotency:
 *   recordReelProgress uses ON CONFLICT DO NOTHING at the DB level.
 *   If the same watch event is processed twice (e.g. pub/sub redelivery after
 *   restart), the second call returns false and the subscriber skips the
 *   progress increment. This prevents double-counting.
 */

import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import Redis from "ioredis";

import { RedisService } from "@redis/redis.service";
import { SkillPathsRepository } from "../skill-paths.repository";
import {
    SKILL_PATH_MIN_COMPLETION_PCT,
    SKILL_PATH_COMPLETION_XP,
    SKILL_PATH_PUBSUB,
    SKILL_PATH_QUEUE_JOBS,
    SKILL_PATH_STATUS,
    SKILL_PATH_XP_SOURCE,
    SKILL_PATH_AWARD_ON_FIRST_COMPLETION_ONLY,
} from "../skill-paths.constants";
import { QUEUES } from "@queues/queue-names";

/** Shape of the REEL_WATCH_ENDED pub/sub payload. */
interface ReelWatchEndedPayload {
    event: string;
    userId: string;
    reelId: string;
    watch_duration_secs: number;
    completion_pct: number;
    timestamp: string;
}

/**
 * Subscribes to video_telemetry channel and processes REEL_WATCH_ENDED events
 * to advance skill path progress for enrolled users.
 */
@Injectable()
export class VideoTelemetrySubscriber implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(VideoTelemetrySubscriber.name);

    /** Dedicated subscriber connection - never used for non-subscribe commands. */
    private subscriberClient!: Redis;

    /** CDN base URL used to construct deterministic certificate URLs. */
    private readonly cdnBaseUrl: string;

    constructor(
        private readonly redisService: RedisService,
        private readonly skillPathsRepository: SkillPathsRepository,
        private readonly config: ConfigService,
        @InjectQueue(QUEUES.XP_AWARD)
        private readonly xpAwardQueue: Queue,
        @InjectQueue(QUEUES.BADGE_EVALUATION)
        private readonly badgeEvaluationQueue: Queue,
        @InjectQueue(QUEUES.NOTIFICATION)
        private readonly notificationQueue: Queue,
    ) {
        this.cdnBaseUrl = this.config.get<string>("CDN_BASE_URL") ?? "";
    }

    /**
     * Creates a dedicated subscriber connection and subscribes to the
     * video_telemetry channel on module initialisation.
     */
    async onModuleInit(): Promise<void> {
        this.subscriberClient = this.redisService.client.duplicate();

        this.subscriberClient.on("error", (err: Error) => {
            this.logger.error(
                `[VideoTelemetrySubscriber] Redis subscriber error: ${err.message}`,
            );
        });

        await this.subscriberClient.subscribe(
            SKILL_PATH_PUBSUB.SUBSCRIBE_CHANNEL,
        );

        this.subscriberClient.on(
            "message",
            (channel: string, message: string) => {
                // Fire-and-forget with top-level catch - must never throw out of this handler
                void this.handleMessage(channel, message).catch(
                    (err: Error) => {
                        this.logger.error(
                            `[VideoTelemetrySubscriber] Unhandled error in handleMessage: ${err.message}`,
                            err.stack,
                        );
                    },
                );
            },
        );

        this.logger.log(
            `[VideoTelemetrySubscriber] Subscribed to channel: ${SKILL_PATH_PUBSUB.SUBSCRIBE_CHANNEL}`,
        );
    }

    /**
     * Quits the dedicated subscriber connection on module destroy.
     * Allows clean NestJS shutdown without hanging open connections.
     */
    async onModuleDestroy(): Promise<void> {
        await this.subscriberClient.quit();
    }

    // -------------------------------------------------------------------------
    // Message handler
    // -------------------------------------------------------------------------

    /**
     * Processes a raw pub/sub message from the video_telemetry channel.
     * Silently ignores unrecognised events or channels.
     *
     * @param channel  The Redis channel the message was received on.
     * @param message  Raw JSON string payload.
     */
    private async handleMessage(
        channel: string,
        message: string,
    ): Promise<void> {
        if (channel !== SKILL_PATH_PUBSUB.SUBSCRIBE_CHANNEL) return;

        let payload: ReelWatchEndedPayload;

        try {
            payload = JSON.parse(message) as ReelWatchEndedPayload;
        } catch {
            this.logger.warn(
                `[VideoTelemetrySubscriber] Failed to parse message on channel ${channel}: ${message}`,
            );
            return;
        }

        if (payload.event !== SKILL_PATH_PUBSUB.EVENTS.REEL_WATCH_ENDED) return;

        await this.processWatchEvent(payload);
    }

    /**
     * Core business logic for a REEL_WATCH_ENDED event.
     *
     * Steps:
     *   1. Gate on completion_pct - ignore events below the threshold
     *   2. Find all in_progress paths for this user that contain the reel
     *   3. For each path: record progress (idempotent), increment counter,
     *      check completion, fire side effects on first completion
     *
     * Per-path errors are caught individually so a failure on one path
     * does not block processing for other paths in the same event.
     *
     * @param payload Parsed REEL_WATCH_ENDED event payload.
     */
    private async processWatchEvent(
        payload: ReelWatchEndedPayload,
    ): Promise<void> {
        const { userId, reelId, completion_pct } = payload;

        // Gate 1: completion percentage below threshold - nothing to record
        if (completion_pct < SKILL_PATH_MIN_COMPLETION_PCT) return;

        // Find all qualifying paths (user enrolled in_progress + reel in path)
        const enrolledPaths =
            await this.skillPathsRepository.getEnrolledPathIdsForReel(
                userId,
                reelId,
            );

        // User is not enrolled in any path containing this reel
        if (enrolledPaths.length === 0) return;

        // Process each path independently
        for (const pathRow of enrolledPaths) {
            try {
                await this.processPathProgress(userId, reelId, pathRow);
            } catch (err) {
                // Isolate per-path failures - log and continue to next path
                this.logger.error(
                    `[VideoTelemetrySubscriber] Error processing path ${pathRow.path_id} ` +
                        `for userId=${userId} reelId=${reelId}: ${(err as Error).message}`,
                    (err as Error).stack,
                );
            }
        }
    }

    /**
     * Processes progress for a single path within a watch event.
     *
     * @param userId   User UUID.
     * @param reelId   Reel UUID that was watched.
     * @param pathRow  Path context row from getEnrolledPathIdsForReel.
     */
    private async processPathProgress(
        userId: string,
        reelId: string,
        pathRow: {
            path_id: string;
            total_reels: number;
            progress_count: number;
            completed_at: string | null;
            path_title: string;
        },
    ): Promise<void> {
        const { path_id, total_reels, path_title } = pathRow;

        // Record the reel as completed - returns false if already recorded (conflict)
        const isNewProgress =
            await this.skillPathsRepository.recordReelProgress(
                userId,
                path_id,
                reelId,
            );

        // Already counted - idempotency guard. Do NOT increment progress_count again.
        if (!isNewProgress) return;

        const newCount = pathRow.progress_count + 1;

        // Check if this reel completion finishes the path
        const isPathCompleted = newCount >= total_reels;

        if (isPathCompleted) {
            await this.handlePathCompletion(
                userId,
                path_id,
                newCount,
                pathRow.completed_at,
                path_title,
            );
        } else {
            // Mid-path progress increment only
            await this.skillPathsRepository.updateEnrolment(userId, path_id, {
                progress_count: newCount,
            });
        }

        // Invalidate enrolments cache so the next read reflects new progress
        await this.skillPathsRepository.invalidateEnrolmentsCache(userId);
    }

    /**
     * Handles the full path completion flow:
     *   1. Generates a certificate URL (deterministic)
     *   2. Updates the enrolment row (status, progress_count, completed_at, certificate_url)
     *   3. Fires XP + badge queue jobs (first completion only)
     *   4. Fires notification queue job (always)
     *   5. Publishes PATH_COMPLETED to gamification_events channel
     *
     * isFirstCompletion is derived from whether completed_at was null before
     * this update. This is the source of truth - not a flag or counter.
     *
     * @param userId         User UUID.
     * @param pathId         Skill path UUID.
     * @param newCount       New progress_count after this reel completion.
     * @param prevCompletedAt The completed_at value BEFORE this update (null = first time).
     * @param pathTitle      Path title for notification payload.
     */
    private async handlePathCompletion(
        userId: string,
        pathId: string,
        newCount: number,
        prevCompletedAt: string | null,
        pathTitle: string,
    ): Promise<void> {
        const isFirstCompletion = prevCompletedAt === null;
        const certificateUrl = this.generateCertificateUrl(userId, pathId);
        const now = new Date().toISOString();

        // Update enrolment to completed state
        await this.skillPathsRepository.updateEnrolment(userId, pathId, {
            status: SKILL_PATH_STATUS.COMPLETED,
            progress_count: newCount,
            completed_at: now,
            certificate_url: certificateUrl,
        });

        // XP and badge jobs - first completion only
        if (SKILL_PATH_AWARD_ON_FIRST_COMPLETION_ONLY && isFirstCompletion) {
            void this.xpAwardQueue.add(SKILL_PATH_QUEUE_JOBS.XP_AWARD, {
                userId,
                source: SKILL_PATH_XP_SOURCE,
                xp_amount: SKILL_PATH_COMPLETION_XP,
                reference_id: pathId,
            });

            void this.badgeEvaluationQueue.add(
                SKILL_PATH_QUEUE_JOBS.BADGE_EVALUATION,
                {
                    userId,
                    event: "path_completed",
                    meta: { pathId },
                },
            );
        }

        // Notification - always sent, regardless of first/repeat completion
        void this.notificationQueue.add(SKILL_PATH_QUEUE_JOBS.NOTIFICATION, {
            type: "path_completed",
            userId,
            meta: {
                path_id: pathId,
                path_title: pathTitle,
                certificate_url: certificateUrl,
                is_first: isFirstCompletion,
            },
        });

        // Publish PATH_COMPLETED to gamification_events for downstream consumers
        void this.redisService.publish(
            SKILL_PATH_PUBSUB.PUBLISH_CHANNEL,
            JSON.stringify({
                event: SKILL_PATH_PUBSUB.EVENTS.PATH_COMPLETED,
                userId,
                pathId,
                timestamp: now,
            }),
        );

        this.logger.log(
            `[VideoTelemetrySubscriber] Path completed: userId=${userId} pathId=${pathId} ` +
                `isFirstCompletion=${isFirstCompletion}`,
        );
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Generates a deterministic certificate URL from userId and pathId.
     *
     * The URL is deterministic so it can be regenerated without storing a
     * random token. Both userId and pathId are UUIDs - their combination is
     * globally unique and collision-resistant without additional entropy.
     *
     * Format: {CDN_BASE_URL}/certificates/{userId}/{pathId}.pdf
     *
     * This is intentionally simple. When certificate generation is fully
     * defined (e.g. signed URLs, PDF generation service), this helper is the
     * single place to update - all callers receive the updated format.
     *
     * @param userId  User UUID.
     * @param pathId  Skill path UUID.
     * @returns Full certificate URL string.
     */
    private generateCertificateUrl(userId: string, pathId: string): string {
        const base = this.cdnBaseUrl.replace(/\/$/, "");
        return `${base}/certificates/${userId}/${pathId}.pdf`;
    }
}
