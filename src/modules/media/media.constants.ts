/**
 * @module modules/media/media.constants
 * @description
 * All shared constants for the Media module: Redis key prefixes, cache TTL
 * values, Pub/Sub event names, channel identifiers, environment variable keys,
 * and HLS output profile definitions used by VideoProcessingWorker.
 *
 * Import these constants everywhere instead of hardcoding strings or numbers.
 */

/**
 * Redis key prefixes used by the Media module.
 *
 * Full key construction:
 *   `${MEDIA_REDIS_KEYS.JOB_PREFIX}:${mediaConvertJobId}`
 *
 * Value stored: JSON string - `{ reelId: string, userId: string }`
 * TTL: {@link MEDIA_CACHE_TTL.JOB_MAPPING} seconds (3600 - must outlive the
 * longest possible MediaConvert job).
 *
 * Written by VideoProcessingWorker immediately after job submission.
 * Read by the webhook handler to resolve reelId + userId from jobId.
 */
export const MEDIA_REDIS_KEYS = {
    /**
     * Key prefix for MediaConvert job-to-reel mapping.
     * Full key: `media:job:{mediaConvertJobId}`
     * Value: JSON string `{ reelId, userId }`
     * TTL: 3600s
     */
    JOB_PREFIX: "media:job",
} as const;

/**
 * Cache TTL values in seconds used by the Media module.
 */
export const MEDIA_CACHE_TTL = {
    /** 1 hour - must outlive the longest MediaConvert transcoding job. */
    JOB_MAPPING: 3600,
} as const;

/**
 * Pub/Sub event names and channel identifiers published by the Media module.
 *
 * REEL_CREATED is intentionally published here (Media) - NOT by the Reels
 * module. It is only safe to publish REEL_CREATED after the reel status
 * becomes `active`, which happens in the webhook handler.
 */
export const MEDIA_MODULE_CONSTANTS = {
    /** Published to content_events when MediaConvert job completes successfully. */
    PROCESSING_COMPLETE: "PROCESSING_COMPLETE",

    /** Published to content_events when MediaConvert job fails. */
    PROCESSING_FAILED: "PROCESSING_FAILED",

    /**
     * Published to content_events after PROCESSING_COMPLETE.
     * Feed module subscribes to this event and rebuilds feeds for users
     * with matching tag affinities.
     *
     * NOTE: This event is owned by Media - do NOT publish from Reels.
     */
    REEL_CREATED: "REEL_CREATED",

    /** Redis Pub/Sub channel for all content lifecycle events. */
    CONTENT_EVENTS: "content_events",
} as const;

/**
 * Environment variable key names read by Media module services.
 * Always use these constants with ConfigService - never hardcode the strings.
 */
export const MEDIA_ENV = {
    /** Account-specific MediaConvert endpoint URL. */
    ENDPOINT: "MEDIACONVERT_ENDPOINT",

    /** ARN of the IAM role MediaConvert assumes for S3 access. */
    ROLE_ARN: "MEDIACONVERT_ROLE_ARN",

    /** 64-char hex secret shared between this API and the webhook Lambda. */
    WEBHOOK_SECRET: "WEBHOOK_SECRET",

    /** Private S3 bucket — creator uploads raw video here via presigned URL. */
    RAW_BUCKET: "S3_RAW_BUCKET",

    /** Public CDN S3 bucket — MediaConvert writes HLS segments and thumbnail here. */
    CDN_BUCKET: "S3_CDN_BUCKET",
} as const;

/**
 * HLS output profiles submitted to MediaConvert.
 * Each entry maps to one rendition in the adaptive-bitrate output group.
 * Ordered highest -> lowest quality; MediaConvert processes in parallel.
 */
export const HLS_OUTPUT_PROFILES = [
    { suffix: "1080p", bitrate: 8500000, width: 1920, height: 1080, qvbrLevel: 8 },
    { suffix: "720p",  bitrate: 5000000, width: 1280, height: 720,  qvbrLevel: 7 },
    { suffix: "480p",  bitrate: 1500000, width: 854,  height: 480,  qvbrLevel: 7 },
    { suffix: "360p",  bitrate: 600000,  width: 640,  height: 360,  qvbrLevel: 6 },
] as const;
