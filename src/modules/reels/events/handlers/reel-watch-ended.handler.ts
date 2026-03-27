/**
 * @module modules/reels/events/handlers/reel-watch-ended.handler
 * @description
 * Handler for REEL_WATCH_ENDED events on the video_telemetry channel.
 *
 * Responsibilities:
 *   1. BF.ADD watched:{userId}                  - mark reel watched for feed filtering
 *   2. HINCRBY reel:meta:{reelId} view_count 1  - live Redis cache counter
 *   3. SADD reels:dirty:views reelId            - flag for DB sync by ViewCountSyncService
 *   4. INSERT user_reel_interaction (watch)     - append-only interaction log
 *
 * DB view_count is NOT updated here - ViewCountSyncService cron handles
 * bulk DB sync every 60 seconds to avoid row lock contention on hot reels.
 *
 * Self-registers into ReelEventRegistry at module load time.
 * Import this file in reel-interactions.subscriber.ts to activate.
 */

import { Logger } from "@nestjs/common";

import { DatabaseService } from "@database/database.service";
import { RedisService } from "@redis/redis.service";
import { uuidv7 } from "@common/utils/uuidv7.util";

import {
    IReelEventHandler,
    ReelEventPayload,
} from "./ireel-event-handler.interface";
import { ReelEventRegistry } from "../registry/reel-event.registry";
import {
    REELS_MODULE_CONSTANTS,
    REELS_REDIS_KEYS,
} from "../../reels.constants";

/** Typed payload for REEL_WATCH_ENDED events. */
interface ReelWatchEndedPayload extends ReelEventPayload {
    userId: string;
    reelId: string;
    watch_duration_secs: number;
    completion_pct: number;
    timestamp: string;
}

/**
 * Handles REEL_WATCH_ENDED pub/sub events.
 * Instantiated by ReelInteractionsSubscriber with injected deps.
 */
export class ReelWatchEndedHandler implements IReelEventHandler {
    readonly channel = REELS_MODULE_CONSTANTS.VIDEO_TELEMETRY;
    readonly event = REELS_MODULE_CONSTANTS.REEL_WATCH_ENDED;

    private readonly logger = new Logger(ReelWatchEndedHandler.name);

    /**
     * @param redis Shared Redis client for BF, HINCRBY, SADD operations.
     * @param db PostgreSQL client for interaction log insert.
     */
    constructor(
        private readonly redis: RedisService,
        private readonly db: DatabaseService,
    ) {}

    /**
     * Handle REEL_WATCH_ENDED - executes 4 independent side effects.
     * Each step is wrapped individually - one failure never blocks others.
     *
     * @param payload Parsed REEL_WATCH_ENDED payload.
     */
    async handle(payload: ReelEventPayload): Promise<void> {
        const { userId, reelId, watch_duration_secs, completion_pct } =
            payload as ReelWatchEndedPayload;

        // 1 - BF.ADD watched:{userId} reelId
        try {
            await this.redis.bfAdd(
                `${REELS_REDIS_KEYS.WATCHED_PREFIX}:${userId}`,
                reelId,
            );
        } catch (err) {
            this.logger.warn(
                `BF.ADD failed userId=${userId} reelId=${reelId}: ${(err as Error).message}`,
            );
        }

        // 2 - HINCRBY reel:meta:{reelId} view_count 1
        try {
            await this.redis.hincrby(
                `${REELS_REDIS_KEYS.META_PREFIX}:${reelId}`,
                "view_count",
                1,
            );
        } catch (err) {
            this.logger.warn(
                `HINCRBY view_count failed reelId=${reelId}: ${(err as Error).message}`,
            );
        }

        // 3 - SADD reels:dirty:views reelId
        try {
            await this.redis.sadd(REELS_REDIS_KEYS.DIRTY_VIEWS, reelId);
        } catch (err) {
            this.logger.warn(
                `SADD dirty views failed reelId=${reelId}: ${(err as Error).message}`,
            );
        }

        // 4 - INSERT user_reel_interaction (watch)
        try {
            const id = uuidv7();
            await this.db.query(
                `INSERT INTO user_reel_interaction
                 (id, user_id, reel_id, interaction_type, watch_duration_secs, completion_pct, created_at)
                 VALUES ($1, $2, $3, 'watch', $4, $5, now())`,
                [id, userId, reelId, watch_duration_secs, completion_pct],
            );
        } catch (err) {
            this.logger.error(
                `INSERT user_reel_interaction (watch) failed userId=${userId} reelId=${reelId}: ${(err as Error).message}`,
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Self-registration
// Runs once when this file is imported by reel-interactions.subscriber.ts.
// Registry stores the constructor - subscriber instantiates with deps.
// ---------------------------------------------------------------------------
ReelEventRegistry.register(
    REELS_MODULE_CONSTANTS.VIDEO_TELEMETRY,
    REELS_MODULE_CONSTANTS.REEL_WATCH_ENDED,
    ReelWatchEndedHandler,
);
