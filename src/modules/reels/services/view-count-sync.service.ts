/**
 * @module modules/reels/services/view-count-sync.service
 * @description
 * Scheduled service that syncs view_count from Redis cache to PostgreSQL
 * every 60 seconds. Avoids row lock contention on hot reels by batching
 * all increments into a single UPDATE per reel.
 *
 * Flow:
 *   1. SMEMBERS reels:dirty:views  - get reel IDs with new views
 *   2. DEL reels:dirty:views       - clear set atomically before processing
 *   3. For each dirty reel:
 *        a. HGET reel:meta:{reelId} view_count - read live count from cache
 *        b. If cache miss -> skip (DB already consistent, no views since last TTL)
 *        c. UPDATE reels SET view_count = $2 WHERE id = $1
 *
 * Runs every 60 seconds via @Cron. Requires @nestjs/schedule + ScheduleModule.
 */

import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import { DatabaseService } from "@database/database.service";
import { RedisService } from "@redis/redis.service";

import { REELS_REDIS_KEYS } from "../reels.constants";

/**
 * Syncs Redis view counts to PostgreSQL on a 60-second schedule.
 */
@Injectable()
export class ViewCountSyncService {
    private readonly logger = new Logger(ViewCountSyncService.name);

    /** Prevent overlapping runs if a sync takes longer than 60 seconds. */
    private isSyncing = false;

    /**
     * @param redis Redis client for reading dirty set and cache counters.
     * @param db PostgreSQL client for bulk view count updates.
     */
    constructor(
        private readonly redis: RedisService,
        private readonly db: DatabaseService,
    ) {}

    /**
     * Sync view counts from Redis to DB every 60 seconds.
     * Skips run if previous sync is still in progress (overlap guard).
     */
    @Cron("*/60 * * * * *")
    async syncViewCounts(): Promise<void> {
        if (this.isSyncing) {
            this.logger.warn(
                "ViewCountSync skipped - previous run still in progress",
            );
            return;
        }

        this.isSyncing = true;

        try {
            await this.runSync();
        } catch (err) {
            this.logger.error(
                `ViewCountSync failed: ${(err as Error).message}`,
            );
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Core sync logic - reads dirty set, clears it, then syncs each reel.
     */
    private async runSync(): Promise<void> {
        // read dirty reel IDs
        const dirtyIds = await this.redis.smembers(
            REELS_REDIS_KEYS.DIRTY_VIEWS,
        );

        if (dirtyIds.length === 0) return;

        this.logger.debug(`ViewCountSync - syncing ${dirtyIds.length} reels`);

        // clear dirty set BEFORE processing
        // If we cleared after, we'd lose IDs that arrived during processing
        await this.redis.del(REELS_REDIS_KEYS.DIRTY_VIEWS);

        // sync each dirty reel
        let synced = 0;
        let skipped = 0;

        for (const reelId of dirtyIds) {
            try {
                const synced_ = await this.syncReel(reelId);
                if (synced_) {
                    synced++;
                } else {
                    skipped++;
                }
            } catch (err) {
                this.logger.error(
                    `ViewCountSync failed for reelId=${reelId}: ${(err as Error).message}`,
                );
                // Continue with remaining reels - one failure must not block others
            }
        }

        this.logger.log(
            `ViewCountSync complete - synced=${synced} skipped=${skipped} total=${dirtyIds.length}`,
        );
    }

    /**
     * Sync view_count for a single reel from Redis cache to DB.
     * Returns true if DB was updated, false if cache miss (skip).
     *
     * @param reelId Reel UUID.
     * @returns true if updated, false if skipped.
     */
    private async syncReel(reelId: string): Promise<boolean> {
        const cacheKey = `${REELS_REDIS_KEYS.INTERACTION_META_PREFIX}:${reelId}`;

        // Read live view_count from Redis cache
        const raw = await this.redis.hget(cacheKey, "view_count");

        if (raw === null) {
            // Cache miss - TTL expired. DB is already the source of truth.
            // No-op: the last sync before TTL expiry already wrote the correct value.
            return false;
        }

        const viewCount = parseInt(raw, 10);

        if (isNaN(viewCount)) {
            this.logger.warn(
                `ViewCountSync - invalid view_count "${raw}" for reelId=${reelId}`,
            );
            return false;
        }

        // Write to DB - set absolute value, not increment
        // This is safe because Redis is the authoritative live counter
        await this.db.query(
            `UPDATE reels
             SET view_count = $2,
                 updated_at = now()
             WHERE id = $1`,
            [reelId, viewCount],
        );

        return true;
    }
}
