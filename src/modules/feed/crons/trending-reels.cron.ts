/**
 * @module modules/feed/crons/trending-reels.cron
 * @description
 * Scheduled service that rebuilds the trending:reels Redis Sorted Set
 * every 15 minutes. Scores are 24-hour view counts per reel sourced
 * directly from the user_reel_interaction table.
 *
 * Flow:
 *   1. Query DB for top 100 reel IDs by 24h view count (active reels only)
 *   2. Rebuild trending:reels sorted set atomically via pipeline
 *      (DEL + N×ZADD + EXPIRE in one pipeline exec)
 *
 * Uses an overlap guard to skip runs if the previous one is still in progress.
 * ScheduleModule.forRoot() is registered in AppModule - not imported here.
 */

import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import { FeedRepository } from "../feed.repository";
import { TRENDING_TTL } from "../feed.constants";

/** Number of trending reels to compute and store per cron run. */
const TRENDING_COMPUTE_LIMIT = 100;

/**
 * Rebuilds the trending:reels sorted set on a 15-minute schedule.
 */
@Injectable()
export class TrendingReelsCron {
    private readonly logger = new Logger(TrendingReelsCron.name);

    /** Prevents overlapping runs if a cycle takes longer than 15 minutes. */
    private isRunning = false;

    /**
     * @param feedRepository Feed data-access layer for DB reads and Redis writes.
     */
    constructor(private readonly feedRepository: FeedRepository) {}

    /**
     * Rebuild the trending:reels sorted set every 15 minutes.
     * Skips the run if the previous cycle is still in progress.
     *
     * @returns void
     */
    @Cron("0 */15 * * * *")
    async rebuildTrending(): Promise<void> {
        if (this.isRunning) {
            this.logger.warn(
                "TrendingReelsCron skipped - previous run still in progress",
            );
            return;
        }

        this.isRunning = true;

        try {
            await this.run();
        } catch (err) {
            this.logger.error(
                `TrendingReelsCron failed: ${(err as Error).message}`,
            );
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Core cron logic - query DB for trending reels and atomically
     * rebuild the sorted set in Redis.
     *
     * @returns void
     */
    private async run(): Promise<void> {
        const trending = await this.feedRepository.getTopTrendingReelIds(
            TRENDING_COMPUTE_LIMIT,
        );

        if (trending.length === 0) {
            this.logger.debug(
                "TrendingReelsCron - no interactions in last 24h, skipping rebuild",
            );
            return;
        }

        const entries = trending.map(({ reelId, viewCount }) => ({
            reelId,
            score: viewCount,
        }));

        await this.feedRepository.rebuildTrendingSet(entries, TRENDING_TTL);

        this.logger.log(
            `TrendingReelsCron complete - rebuilt with ${entries.length} reels`,
        );
    }
}
