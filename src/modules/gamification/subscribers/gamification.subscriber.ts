/**
 * @module modules/gamification/subscribers/gamification.subscriber
 *
 * MIGRATION DIFF vs old version:
 *   - extends BaseSubscriber instead of implementing OnModuleInit/OnModuleDestroy manually
 *   - No @InjectQueue decorators - uses MessagingService.dispatchJob() instead
 *   - No manual JSON.parse, no subscriberClient management, no try/catch boilerplate
 *   - Implements channels() and route() - all other lifecycle is handled by BaseSubscriber
 *   - Handler methods receive typed payload directly (cast from message.payload)
 */

import { Injectable } from "@nestjs/common";
import { RedisService } from "@redis/redis.service";
import { MessagingService } from "@modules/messaging/messaging.service";
import { BaseSubscriber } from "@modules/messaging/base.subscriber";
import {
    AppMessage,
    ReelWatchEndedEventPayload,
    PathCompletedEventPayload,
} from "@modules/messaging/messaging.interface";
import {
    GAMIFICATION_QUEUE_JOBS,
    REDIS_CHANNELS,
    VIDEO_TELEMETRY_EVENTS,
    GAMIFICATION_EVENTS,
} from "@modules/messaging/messaging.constants";
import {
    XP_SOURCE,
    REEL_WATCH_XP_REWARD,
} from "../gamification.constants";

@Injectable()
export class GamificationSubscriber extends BaseSubscriber {
    constructor(
        redisService: RedisService,
        private readonly messagingService: MessagingService,
    ) {
        super(redisService);
    }

    // -------------------------------------------------------------------------
    // Channel declaration
    // -------------------------------------------------------------------------

    protected channels(): string[] {
        return [REDIS_CHANNELS.VIDEO_TELEMETRY, REDIS_CHANNELS.CONTENT_EVENTS];
    }

    // -------------------------------------------------------------------------
    // Routing
    // -------------------------------------------------------------------------

    /**
     * Routes validated AppMessage envelopes to typed handlers.
     * message.payload is cast to the expected shape per branch.
     * Unhandled event types are silently ignored (other modules' events
     * land on shared channels - that is intentional and not a warning).
     */
    protected async route(
        channel: string,
        message: AppMessage<unknown>,
    ): Promise<void> {
        if (
            channel === REDIS_CHANNELS.VIDEO_TELEMETRY &&
            message.type === VIDEO_TELEMETRY_EVENTS.REEL_WATCH_ENDED
        ) {
            await this.handleReelWatchEnded(
                message.payload as ReelWatchEndedEventPayload,
            );
            return;
        }

        if (
            channel === REDIS_CHANNELS.CONTENT_EVENTS &&
            message.type === GAMIFICATION_EVENTS.PATH_COMPLETED
        ) {
            await this.handlePathCompleted(
                message.payload as PathCompletedEventPayload,
            );
            return;
        }
    }

    // -------------------------------------------------------------------------
    // Handlers - fire-and-forget via MessagingService
    // -------------------------------------------------------------------------

    private async handleReelWatchEnded(
        payload: ReelWatchEndedEventPayload,
    ): Promise<void> {
        const { userId, reelId } = payload;

        this.logger.debug(`REEL_WATCH_ENDED userId=${userId} reelId=${reelId}`);

        void this.messagingService.dispatchJob(
            GAMIFICATION_QUEUE_JOBS.XP_AWARD,
            {
                userId,
                source: XP_SOURCE.REEL_WATCH,
                xp_amount: REEL_WATCH_XP_REWARD,
                reference_id: reelId,
            },
        );

        void this.messagingService.dispatchJob(
            GAMIFICATION_QUEUE_JOBS.UPDATE_USER_STREAK,
            { userId },
        );

        void this.messagingService.dispatchJob(
            GAMIFICATION_QUEUE_JOBS.BADGE_EVALUATION,
            {
                userId,
                event: VIDEO_TELEMETRY_EVENTS.REEL_WATCH_ENDED,
                meta: { reelId },
            },
        );
    }

    private async handlePathCompleted(
        payload: PathCompletedEventPayload,
    ): Promise<void> {
        const { userId, pathId, xp_amount } = payload;

        this.logger.debug(`PATH_COMPLETED userId=${userId} pathId=${pathId}`);

        void this.messagingService.dispatchJob(
            GAMIFICATION_QUEUE_JOBS.XP_AWARD,
            {
                userId,
                source: XP_SOURCE.PATH_COMPLETED,
                xp_amount,
                reference_id: pathId,
            },
        );

        void this.messagingService.dispatchJob(
            GAMIFICATION_QUEUE_JOBS.BADGE_EVALUATION,
            {
                userId,
                event: GAMIFICATION_EVENTS.PATH_COMPLETED,
                meta: { pathId },
            },
        );
    }
}
