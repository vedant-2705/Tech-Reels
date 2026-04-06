import {
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from "@nestjs/common";
import Redis from "ioredis";
import { RedisService } from "@redis/redis.service";
import { AppMessage } from "./messaging.interface";

/**
 * BaseSubscriber
 *
 * Handles the Redis Pub/Sub lifecycle and envelope parsing so concrete
 * subscribers only implement routing and business logic.
 *
 * What it does:
 *   - Duplicates the shared Redis connection on init (subscriber mode requires
 *     a dedicated connection - calling .subscribe() on the shared client blocks
 *     all other Redis commands on that connection).
 *   - Parses raw JSON messages into AppMessage<unknown>.
 *   - Calls route() which concrete classes implement to dispatch to handlers.
 *   - Catches and logs errors per-message so a bad payload never crashes the loop.
 *   - Gracefully disconnects on module destroy.
 *
 * Concrete subscribers:
 *   1. Extend BaseSubscriber
 *   2. Implement channels() returning the Redis channel names to subscribe to
 *   3. Implement route(channel, message) to dispatch to typed handlers
 *   4. Never call super or manage the Redis connection directly
 *
 * @example
 * @Injectable()
 * export class GamificationSubscriber extends BaseSubscriber {
 *   protected channels() { return [REDIS_CHANNELS.VIDEO_TELEMETRY, REDIS_CHANNELS.CONTENT_EVENTS]; }
 *
 *   protected async route(channel: string, message: AppMessage): Promise<void> {
 *     if (channel === REDIS_CHANNELS.VIDEO_TELEMETRY && message.type === VIDEO_TELEMETRY_EVENTS.REEL_WATCH_ENDED) {
 *       await this.handleReelWatchEnded(message.payload as ReelWatchEndedEventPayload);
 *     }
 *   }
 * }
 */
@Injectable()
export abstract class BaseSubscriber implements OnModuleInit, OnModuleDestroy {
    protected readonly logger = new Logger(this.constructor.name);

    /**
     * Dedicated ioredis connection for subscribe mode.
     * Never share this with publish / get / set calls.
     */
    private subscriberClient!: Redis;

    constructor(protected readonly redisService: RedisService) {}

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    async onModuleInit(): Promise<void> {
        this.subscriberClient = this.redisService.client.duplicate();

        this.subscriberClient.on("error", (err: Error) => {
            this.logger.error(`Redis subscriber error: ${err.message}`);
        });

        const channelList = this.channels();
        await this.subscriberClient.subscribe(...channelList);

        this.subscriberClient.on("message", (channel: string, raw: string) => {
            void this.onMessage(channel, raw);
        });

        this.logger.log(`Subscribed to channels: [${channelList.join(", ")}]`);
    }

    async onModuleDestroy(): Promise<void> {
        await this.subscriberClient.quit();
        this.logger.log("Subscriber connection closed.");
    }

    // -------------------------------------------------------------------------
    // Internal message handling
    // -------------------------------------------------------------------------

    /**
     * Parses the raw JSON string into AppMessage<unknown> and calls route().
     * Errors are caught and logged - a bad message must never crash the loop.
     */
    private async onMessage(channel: string, raw: string): Promise<void> {
        let message: AppMessage<unknown>;

        try {
            const parsed = JSON.parse(raw) as Record<string, unknown>;

            // Validate it is an AppMessage envelope (not a legacy raw event)
            if (!parsed["payload"] || !parsed["type"] || !parsed["id"]) {
                this.logger.warn(
                    `Non-envelope message on channel "${channel}" - skipping. ` +
                        `Raw: ${raw.slice(0, 200)}`,
                );
                return;
            }

            message = parsed as unknown as AppMessage<unknown>;
        } catch {
            this.logger.warn(
                `Failed to parse message on channel "${channel}": ${raw.slice(0, 200)}`,
            );
            return;
        }

        this.logger.debug(
            `Received | channel="${channel}" type="${message.type}" id="${message.id}"`,
        );

        try {
            await this.route(channel, message);
        } catch (err) {
            this.logger.error(
                `Error routing event "${message.type}" on channel "${channel}": ` +
                    `${(err as Error).message}`,
            );
        }
    }

    // -------------------------------------------------------------------------
    // Abstract interface for concrete classes
    // -------------------------------------------------------------------------

    /**
     * Return the list of Redis channel names this subscriber should listen on.
     * Called once during onModuleInit.
     */
    protected abstract channels(): string[];

    /**
     * Route an incoming message to the correct typed handler.
     * The message is already parsed and envelope-validated.
     * Cast message.payload to your expected type inside each branch.
     *
     * @param channel - The Redis channel the message arrived on
     * @param message - Parsed AppMessage envelope (payload is unknown, cast it)
     */
    protected abstract route(
        channel: string,
        message: AppMessage<unknown>,
    ): Promise<void>;
}
