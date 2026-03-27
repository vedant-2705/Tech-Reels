/**
 * @module modules/reels/subscribers/reel-watch.subscriber
 * @description
 * Redis pub/sub subscriber for the video_telemetry channel.
 * Handles REEL_WATCH_ENDED events published by ReelsService.watchReel().
 *
 * Responsibilities on REEL_WATCH_ENDED:
 *   1. BF.ADD watched:{userId}   - mark reel as watched for feed filtering
 *   2. HINCRBY reel:meta:{reelId} view_count 1 - live cache counter
 *   3. SADD reels:dirty:views reelId - flag reel for DB sync by cron
 *   4. INSERT user_reel_interaction - append-only interaction log
 *
 * DB view_count is NOT updated here - ViewCountSyncService cron handles
 * bulk DB sync every 60 seconds from Redis cache to avoid row lock contention
 * on hot reels.
 *
 * Uses a dedicated ioredis connection - pub/sub mode blocks the connection
 * for regular commands so it must never share with RedisService.client.
 */

import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { DatabaseService } from '@database/database.service';
import { RedisService } from '@redis/redis.service';
import { uuidv7 } from '@common/utils/uuidv7.util';

import {
    REELS_MODULE_CONSTANTS,
    REELS_REDIS_KEYS,
} from '../reels.constants';

/** Shape of the REEL_WATCH_ENDED pub/sub payload. */
interface ReelWatchEndedPayload {
    event: string;
    userId: string;
    reelId: string;
    watch_duration_secs: number;
    completion_pct: number;
    timestamp: string;
}

/** Composite dispatch key: {channel}:{event} */
type DispatchKey = string;

/**
 * Subscriber service for video_telemetry pub/sub channel.
 * Manages its own dedicated Redis connection for subscribe mode.
 */
@Injectable()
export class ReelWatchSubscriber implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(ReelWatchSubscriber.name);
    private subscriber!: Redis;

    /** Dispatch map: composite key -> handler. Avoids if-else chains. */
    private readonly handlers = new Map<
        DispatchKey,
        (payload: unknown) => Promise<void>
    >();

    /**
     * @param config Runtime configuration for Redis connection.
     * @param redis Shared Redis client for non-subscribe commands.
     * @param db PostgreSQL database service.
     */
    constructor(
        private readonly redis: RedisService,
        private readonly db: DatabaseService,
    ) {}

    /**
     * Initialise dedicated subscriber connection and register dispatch handlers.
     * Called automatically by NestJS on module init.
     */
    async onModuleInit(): Promise<void> {
        // Dedicated connection - never share with RedisService.client
        this.subscriber = this.redis.client.duplicate();

        this.subscriber.on('error', (err: Error) => {
            this.logger.error(
                `[ReelWatchSubscriber] Redis error: ${err.message}`,
            );
        });

        // Register dispatch handlers
        this.handlers.set(
            `${REELS_MODULE_CONSTANTS.VIDEO_TELEMETRY}:${REELS_MODULE_CONSTANTS.REEL_WATCH_ENDED}`,
            (p) => this.handleReelWatchEnded(p as ReelWatchEndedPayload),
        );

        // Subscribe to channel
        await this.subscriber.subscribe(
            REELS_MODULE_CONSTANTS.VIDEO_TELEMETRY,
        );

        this.subscriber.on('message', (channel: string, message: string) => {
            void this.onMessage(channel, message);
        });

        this.logger.log(
            `Subscribed to channel: ${REELS_MODULE_CONSTANTS.VIDEO_TELEMETRY}`,
        );
    }

    /**
     * Route incoming pub/sub message to the correct handler via dispatch map.
     * Malformed messages are logged and swallowed - never throw from here.
     *
     * @param channel Redis pub/sub channel name.
     * @param message Raw JSON string payload.
     */
    private async onMessage(
        channel: string,
        message: string,
    ): Promise<void> {
        let parsed: { event?: string } | null = null;

        try {
            parsed = JSON.parse(message) as { event?: string };
        } catch {
            this.logger.warn(
                `[ReelWatchSubscriber] Failed to parse message on channel "${channel}": ${message}`,
            );
            return;
        }

        const event = parsed?.event;
        if (!event) {
            this.logger.warn(
                `[ReelWatchSubscriber] Missing event field on channel "${channel}"`,
            );
            return;
        }

        const key: DispatchKey = `${channel}:${event}`;
        const handler = this.handlers.get(key);

        if (!handler) {
            // Not an error - other modules publish to same channels
            return;
        }

        try {
            await handler(parsed);
        } catch (err) {
            this.logger.error(
                `[ReelWatchSubscriber] Handler failed for key "${key}": ${(err as Error).message}`,
            );
        }
    }

    /**
     * Handle REEL_WATCH_ENDED event.
     * Performs 4 side effects - each wrapped independently so one failure
     * does not block the others.
     *
     * @param payload Validated REEL_WATCH_ENDED payload.
     */
    private async handleReelWatchEnded(
        payload: ReelWatchEndedPayload,
    ): Promise<void> {
        const { userId, reelId, watch_duration_secs, completion_pct } = payload;

        // 1 - BF.ADD watched:{userId} reelId
        // Marks reel as watched so feed/search can filter it out
        try {
            await this.redis.bfAdd(
                `${REELS_REDIS_KEYS.WATCHED_PREFIX}:${userId}`,
                reelId,
            );
        } catch (err) {
            this.logger.warn(
                `BF.ADD failed for userId=${userId} reelId=${reelId}: ${(err as Error).message}`,
            );
            // Non-fatal - feed filtering degrades gracefully
        }

        // 2 - HINCRBY reel:meta:{reelId} view_count 1
        // Live cache counter - read by feed and reel detail endpoints
        try {
            await this.redis.hincrby(
                `${REELS_REDIS_KEYS.META_PREFIX}:${reelId}`,
                'view_count',
                1,
            );
        } catch (err) {
            this.logger.warn(
                `HINCRBY view_count failed for reelId=${reelId}: ${(err as Error).message}`,
            );
            // Non-fatal - cache miss will repopulate from DB on next read
        }

        // 3 - SADD reels:dirty:views reelId
        // Flags reel for DB sync by ViewCountSyncService cron
        try {
            await this.redis.sadd(
                REELS_REDIS_KEYS.DIRTY_VIEWS,
                reelId,
            );
        } catch (err) {
            this.logger.warn(
                `SADD dirty views failed for reelId=${reelId}: ${(err as Error).message}`,
            );
            // Non-fatal - worst case DB view_count misses this increment
            // until next cache-based sync catches it
        }

        // 4 - INSERT user_reel_interaction
        // Append-only interaction log used by affinity scoring and analytics
        try {
            await this.insertWatchInteraction(
                userId,
                reelId,
                watch_duration_secs,
                completion_pct,
            );
        } catch (err) {
            this.logger.error(
                `INSERT user_reel_interaction failed for userId=${userId} reelId=${reelId}: ${(err as Error).message}`,
            );
            // Non-fatal for feed - but log as error since this is analytics data
        }
    }

    /**
     * Insert a watch interaction row into user_reel_interaction.
     *
     * @param userId User UUID.
     * @param reelId Reel UUID.
     * @param watchDurationSecs Watch duration in seconds.
     * @param completionPct Completion percentage (0-100).
     */
    private async insertWatchInteraction(
        userId: string,
        reelId: string,
        watchDurationSecs: number,
        completionPct: number,
    ): Promise<void> {
        const id = uuidv7();
        await this.db.query(
            `INSERT INTO user_reel_interaction
             (id, user_id, reel_id, interaction_type, watch_duration_secs, completion_pct, created_at)
             VALUES ($1, $2, $3, 'watch', $4, $5, now())`,
            [id, userId, reelId, watchDurationSecs, completionPct],
        );
    }

    /**
     * Gracefully disconnect the dedicated subscriber connection on shutdown.
     */
    async onModuleDestroy(): Promise<void> {
        await this.subscriber.quit();
    }
}