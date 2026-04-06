/**
 * @module modules/media/media.service
 * @description
 * Orchestrates the MediaConvert webhook processing pipeline.
 *
 * On COMPLETE:
 *   1.  Validate HMAC-SHA256 signature (timing-safe).
 *   2.  Resolve reelId + userId from media:job:{jobId} Redis cache.
 *   3.  Persist processing result via MediaRepository.
 *   4.  Invalidate reel:meta:{reelId} cache.
 *   5.  Populate reel_tags:tag:{tagId} Redis Sets for feed candidates.
 *   6.  Invalidate tags cache (tags:all + tags:category:*).
 *   7.  Publish PROCESSING_COMPLETE to content_events.
 *   8.  Publish REEL_CREATED to content_events (Feed module subscriber).
 *
 * On ERROR:
 *   1.  Validate HMAC signature.
 *   2.  Resolve reelId + userId from cache.
 *   3.  Mark reel as failed via MediaRepository.
 *   4.  Publish PROCESSING_FAILED to content_events.
 *
 * Business rule: REEL_CREATED is published here - NOT by the Reels module.
 * The event is only safe after reel status becomes `active`.
 */

import * as crypto from "crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { RedisService } from "@redis/redis.service";
import {
    REEL_META_PREFIX,
    REEL_TAG_SET_PREFIX,
    TAGS_ALL_KEY,
    TAGS_CATEGORY_PREFIX,
} from "@common/constants/redis-keys.constants";
import { ReelsProcessingService } from "@modules/reels/reels-processing.service";

import { MediaRepository } from "./media.repository";
import { WebhookPayloadDto } from "./dto/webhook-payload.dto";
import { InvalidWebhookSignatureException } from "./exceptions/invalid-webhook-signature.exception";
import {
    MEDIA_REDIS_KEYS,
    MEDIA_ENV,
    MEDIA_MODULE_CONSTANTS,
} from "./media.constants";

/**
 * Value stored in the media:job:{jobId} Redis cache entry.
 * Written by VideoProcessingWorker; read by handleWebhook.
 */
interface JobCacheEntry {
    reelId: string;
    userId: string;
}

/**
 * Service handling the complete MediaConvert webhook flow.
 */
@Injectable()
export class MediaService {
    private readonly logger = new Logger(MediaService.name);

    /**
     * @param config                  ConfigService for WEBHOOK_SECRET.
     * @param redis                   RedisService for cache reads/writes/pub.
     * @param mediaRepository         MediaRepository for reel DB updates.
     * @param reelsProcessingService  ReelsProcessingService for tag retrieval.
     */
    constructor(
        private readonly config: ConfigService,
        private readonly redis: RedisService,
        private readonly mediaRepository: MediaRepository,
        private readonly reelsProcessingService: ReelsProcessingService,
    ) {}

    /**
     * Validates the HMAC-SHA256 signature then dispatches to the appropriate
     * COMPLETE or ERROR processing branch.
     *
     * @param rawBody  Raw request body Buffer captured before JSON parsing.
     * @param signature  Value of X-Webhook-Signature header (format: `sha256={hex}`).
     * @param dto  Parsed webhook payload.
     * @returns `{ received: true }` on success.
     * @throws InvalidWebhookSignatureException if HMAC is invalid.
     */
    async handleWebhook(
        rawBody: Buffer,
        signature: string,
        dto: WebhookPayloadDto,
    ): Promise<{ received: boolean }> {
        this.validateSignature(rawBody, signature);

        if (dto.status === "COMPLETE") {
            await this.handleComplete(dto);
        } else {
            await this.handleError(dto);
        }

        return { received: true };
    }

    //  Private helpers 

    /**
     * Validates the HMAC-SHA256 webhook signature using timing-safe comparison.
     * Must be called with the raw request body Buffer, before JSON parsing.
     *
     * @param rawBody    Raw request body as a Buffer.
     * @param signature  X-Webhook-Signature header value.
     * @throws InvalidWebhookSignatureException on mismatch or missing header.
     */
    private validateSignature(rawBody: Buffer, signature: string): void {
        const secret = this.config.get<string>(MEDIA_ENV.WEBHOOK_SECRET);
        if (!secret) {
            this.logger.error("WEBHOOK_SECRET is not configured");
            throw new InvalidWebhookSignatureException();
        }

        const expectedHex = crypto
            .createHmac("sha256", secret)
            .update(rawBody)
            .digest("hex");

        // Strip the "sha256=" prefix sent by the Lambda.
        const receivedHex = (signature ?? "").replace(/^sha256=/, "");

        // Buffers must be the same length for timingSafeEqual; if the
        // received signature is malformed/empty the comparison must still
        // be constant-time - compare against a dummy of equal length.
        let valid = false;
        try {
            valid = crypto.timingSafeEqual(
                Buffer.from(expectedHex, "hex"),
                Buffer.from(receivedHex, "hex"),
            );
        } catch {
            // Buffer.from(..., 'hex') with an odd-length or non-hex string
            // throws - treat as invalid signature.
            valid = false;
        }

        if (!valid) {
            throw new InvalidWebhookSignatureException();
        }
    }

    /**
     * Resolves reelId and userId from the Redis job-mapping cache.
     *
     * @param jobId  AWS MediaConvert job ID.
     * @returns Parsed { reelId, userId } or null if the cache entry is missing/expired.
     */
    private async resolveJobEntry(
        jobId: string,
    ): Promise<JobCacheEntry | null> {
        const key = `${MEDIA_REDIS_KEYS.JOB_PREFIX}:${jobId}`;
        const raw = await this.redis.get(key);
        if (!raw) return null;
        try {
            return JSON.parse(raw) as JobCacheEntry;
        } catch {
            this.logger.error(
                `Failed to parse job cache entry for jobId ${jobId}`,
            );
            return null;
        }
    }

    /**
     * Handles a COMPLETE webhook event: updates DB, invalidates caches,
     * populates tag Sets, and publishes PROCESSING_COMPLETE + REEL_CREATED.
     *
     * @param dto  Validated webhook payload with status=COMPLETE.
     */
    private async handleComplete(dto: WebhookPayloadDto): Promise<void> {
        const entry = await this.resolveJobEntry(dto.jobId);
        if (!entry) {
            this.logger.warn(
                `Job cache miss for jobId ${dto.jobId} - reel ${dto.reelId}. ` +
                    "TTL may have expired or the worker failed to store the mapping.",
            );
            return;
        }
        const { reelId, userId } = entry;
        const outputs = dto.outputs!;

        //  Step 3: Persist processing result 
        await this.reelsProcessingService.setProcessingResult(reelId, {
            status: "active",
            hls_path: outputs.hls_path,
            thumbnail_key: outputs.thumbnail_key,
            duration_seconds: outputs.duration_seconds,
        });

        //  Step 4: Invalidate reel meta cache 
        const metaKey = `${REEL_META_PREFIX}:${reelId}`;
        await this.redis.del(metaKey);

        //  Step 5: Populate reel_tags:tag:{tagId} Sets 
        const tags = await this.reelsProcessingService.getTagsForReel(reelId);
        const tagIds = tags.map((t) => t.id);

        await Promise.all(
            tags.map((tag) => {
                const tagSetKey = `${REEL_TAG_SET_PREFIX}:${tag.id}`;
                return this.redis.sadd(tagSetKey, reelId);
            }),
        );

        //  Step 6: Invalidate tags cache 
        await this.redis.del(TAGS_ALL_KEY);

        // Collect unique categories and delete per-category cache keys.
        const categories = [...new Set(tags.map((t) => t.category))];
        await Promise.all(
            categories.map((category) =>
                this.redis.deletePattern(
                    `${TAGS_CATEGORY_PREFIX}:${category}`,
                ),
            ),
        );

        //  Step 7: Publish PROCESSING_COMPLETE 
        await this.redis.publish(
            MEDIA_MODULE_CONSTANTS.CONTENT_EVENTS,
            JSON.stringify({
                event: MEDIA_MODULE_CONSTANTS.PROCESSING_COMPLETE,
                reelId,
                userId,
                hls_path: outputs.hls_path,
                thumbnail_key: outputs.thumbnail_key,
                timestamp: new Date().toISOString(),
            }),
        );

        //  Step 8: Publish REEL_CREATED 
        // Feed module subscribes to this event to rebuild feeds for users
        // with affinities matching the reel's tags.
        await this.redis.publish(
            MEDIA_MODULE_CONSTANTS.CONTENT_EVENTS,
            JSON.stringify({
                event: MEDIA_MODULE_CONSTANTS.REEL_CREATED,
                reelId,
                userId,
                tagIds,
                timestamp: new Date().toISOString(),
            }),
        );

        this.logger.log(
            `Processing complete for reel ${reelId} - ` +
                `${tags.length} tag(s), events published.`,
        );
    }

    /**
     * Handles an ERROR webhook event: marks the reel as failed and publishes
     * PROCESSING_FAILED.
     *
     * @param dto  Validated webhook payload with status=ERROR.
     */
    private async handleError(dto: WebhookPayloadDto): Promise<void> {
        const entry = await this.resolveJobEntry(dto.jobId);
        if (!entry) {
            this.logger.warn(
                `Job cache miss for failed jobId ${dto.jobId} - ` +
                    "cannot update reel status.",
            );
            return;
        }
        const { reelId, userId } = entry;

        //  Mark reel failed 
        await this.mediaRepository.markFailed(reelId);

        //  Publish PROCESSING_FAILED 
        await this.redis.publish(
            MEDIA_MODULE_CONSTANTS.CONTENT_EVENTS,
            JSON.stringify({
                event: MEDIA_MODULE_CONSTANTS.PROCESSING_FAILED,
                reelId,
                userId,
                error: dto.error ?? "Unknown MediaConvert error",
                timestamp: new Date().toISOString(),
            }),
        );

        this.logger.warn(
            `Processing failed for reel ${reelId}: ${dto.error ?? "no error detail"}`,
        );
    }
}
