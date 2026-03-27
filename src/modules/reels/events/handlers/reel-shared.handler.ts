/**
 * @module modules/reels/events/handlers/reel-shared.handler
 * @description
 * Handler for REEL_SHARED events on the user_interactions channel.
 *
 * Responsibilities:
 *   1. INSERT user_reel_interaction (share) - append-only interaction log
 *
 * share_count increment is handled synchronously in ReelsService.shareReel()
 * (DB + Redis cache) - not duplicated here.
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
import { REELS_MODULE_CONSTANTS } from "../../reels.constants";

/** Typed payload for REEL_SHARED events. */
interface ReelSharedPayload extends ReelEventPayload {
    userId: string;
    reelId: string;
    tags: string[];
    timestamp: string;
}

/**
 * Handles REEL_SHARED pub/sub events.
 * Instantiated by ReelInteractionsSubscriber with injected deps.
 */
export class ReelSharedHandler implements IReelEventHandler {
    readonly channel = REELS_MODULE_CONSTANTS.USER_INTERACTIONS;
    readonly event = REELS_MODULE_CONSTANTS.REEL_SHARED;

    private readonly logger = new Logger(ReelSharedHandler.name);

    /**
     * @param _redis Reserved for future share-related Redis operations.
     * @param db PostgreSQL client for interaction log insert.
     */
    constructor(
        private readonly _redis: RedisService,
        private readonly db: DatabaseService,
    ) {}

    /**
     * Handle REEL_SHARED - insert interaction log row.
     * share_platform = 'link' (copy-link is the only mechanism currently).
     *
     * @param payload Parsed REEL_SHARED payload.
     */
    async handle(payload: ReelEventPayload): Promise<void> {
        const { userId, reelId } = payload as ReelSharedPayload;

        try {
            const id = uuidv7();
            await this.db.query(
                `INSERT INTO user_reel_interaction
                 (id, user_id, reel_id, interaction_type, share_platform, created_at)
                 VALUES ($1, $2, $3, 'share', 'link', now())`,
                [id, userId, reelId],
            );
        } catch (err) {
            this.logger.error(
                `INSERT user_reel_interaction (share) failed userId=${userId} reelId=${reelId}: ${(err as Error).message}`,
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
    REELS_MODULE_CONSTANTS.USER_INTERACTIONS,
    REELS_MODULE_CONSTANTS.REEL_SHARED,
    ReelSharedHandler,
);
