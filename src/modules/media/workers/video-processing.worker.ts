/**
 * @module modules/media/workers/video-processing.worker
 * @description
 * BullMQ processor for the `video_processing_queue`. Consumes jobs queued by
 * POST /reels/:id/confirm after the creator's raw upload is verified in S3.
 *
 * Responsibilities:
 *   1. Build and submit a MediaConvert job (HLS + thumbnail).
 *   2. Store a `media:job:{mediaConvertJobId}` Redis mapping (TTL 3600s)
 *      containing `{ reelId, userId }` so the webhook handler can resolve
 *      both values from the job ID alone.
 *
 * This worker does NOT update reel status. The reel row was inserted with
 * status=`processing` by the Reels module's createWithTags() transaction
 * before this job was queued. The worker must never write reel status.
 *
 * @see {@link QUEUES.VIDEO_PROCESSING} for the queue name constant.
 */

import { Injectable, Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { ConfigService } from "@nestjs/config";
import {
    MediaConvertClient,
    CreateJobCommand,
    type CreateJobCommandInput,
} from "@aws-sdk/client-mediaconvert";

import { RedisService } from "@redis/redis.service";
import { QUEUES } from "@queues/queue-names";
import {
    MEDIA_REDIS_KEYS,
    MEDIA_CACHE_TTL,
    MEDIA_ENV,
    HLS_OUTPUT_PROFILES,
} from "../media.constants";

/**
 * Shape of the BullMQ job payload produced by POST /reels/:id/confirm.
 */
export interface VideoProcessingJob {
    reelId: string;
    rawKey: string; // format: reels/{userId}/{reelId}/raw.mp4
    userId: string;
}

/**
 * Processes video_processing_queue jobs by submitting transcoding jobs to
 * AWS MediaConvert and recording the resulting job-ID -> reel-ID mapping.
 */
@Injectable()
@Processor(QUEUES.VIDEO_PROCESSING)
export class VideoProcessingWorker extends WorkerHost {
    private readonly logger = new Logger(VideoProcessingWorker.name);
    private readonly mediaConvert: MediaConvertClient;

    /**
     * @param config ConfigService for reading AWS env vars.
     * @param redis  RedisService for storing the job mapping.
     */
    constructor(
        private readonly config: ConfigService,
        private readonly redis: RedisService,
    ) {
        super();
        // MediaConvert requires an account-specific endpoint.
        this.mediaConvert = new MediaConvertClient({
            endpoint: this.config.get<string>(MEDIA_ENV.ENDPOINT),
            region: this.config.get<string>("AWS_REGION") ?? "ap-south-1",
        });
    }

    /**
     * Entry point called by BullMQ for each dequeued job.
     *
     * @param job BullMQ Job containing { reelId, rawKey, userId }.
     * @returns void - resolves when job mapping is stored in Redis.
     */
    async process(job: Job<VideoProcessingJob>): Promise<void> {
        const { reelId, rawKey, userId } = job.data;

        this.logger.log(
            `Submitting MediaConvert job for reel ${reelId} (key: ${rawKey})`,
        );

        const roleArn = this.config.get<string>(MEDIA_ENV.ROLE_ARN);
        const rawBucket = this.config.get<string>(MEDIA_ENV.RAW_BUCKET);
        const cdnBucket = this.config.get<string>(MEDIA_ENV.CDN_BUCKET);
        const inputS3 = `s3://${rawBucket}/${rawKey}`;
        const outputBase = `s3://${cdnBucket}/reels/${reelId}/`;

        const jobInput: CreateJobCommandInput = {
            Role: roleArn,
            Settings: {
                Inputs: [
                    {
                        FileInput: inputS3,
                        AudioSelectors: {
                            "Audio Selector 1": { DefaultSelection: "DEFAULT" },
                        },
                    },
                ],
                OutputGroups: [
                    //  HLS adaptive-bitrate group
                    {
                        Name: "HLS",
                        OutputGroupSettings: {
                            Type: "HLS_GROUP_SETTINGS",
                            HlsGroupSettings: {
                                Destination: outputBase,
                                SegmentLength: 6,
                                MinSegmentLength: 0,
                            },
                        },
                        Outputs: HLS_OUTPUT_PROFILES.map((profile) => ({
                            NameModifier: `_${profile.suffix}`,
                            ContainerSettings: { Container: "M3U8" },
                            VideoDescription: {
                                Width: profile.width,
                                Height: profile.height,
                                CodecSettings: {
                                    Codec: "H_264",
                                    H264Settings: {
                                        RateControlMode: "QVBR",
                                        QvbrSettings: {
                                            QvbrQualityLevel: profile.qvbrLevel,
                                        },
                                        MaxBitrate: profile.bitrate,
                                        SceneChangeDetect:
                                            "TRANSITION_DETECTION",
                                        QualityTuningLevel: "SINGLE_PASS",
                                    },
                                },
                            },
                            AudioDescriptions: [
                                {
                                    CodecSettings: {
                                        Codec: "AAC",
                                        AacSettings: {
                                            Bitrate: 96000,
                                            CodingMode: "CODING_MODE_2_0",
                                            SampleRate: 48000,
                                        },
                                    },
                                },
                            ],
                        })),
                    },
                    //  Thumbnail frame-capture group
                    {
                        Name: "Thumbnail",
                        OutputGroupSettings: {
                            Type: "FILE_GROUP_SETTINGS",
                            FileGroupSettings: {
                                // MediaConvert appends ".0000001.jpg" - Lambda
                                // should rename to thumbnail.jpg on upload.
                                Destination: `${outputBase}thumbnail`,
                            },
                        },
                        Outputs: [
                            {
                                ContainerSettings: { Container: "RAW" },
                                VideoDescription: {
                                    CodecSettings: {
                                        Codec: "FRAME_CAPTURE",
                                        FrameCaptureSettings: {
                                            // Capture exactly 1 frame at the 1-second mark.
                                            FramerateNumerator: 1,
                                            FramerateDenominator: 1,
                                            MaxCaptures: 1,
                                        },
                                    },
                                },
                            },
                        ],
                    },
                ],
            },
            // EventBridge passes userMetadata through to the webhook Lambda,
            // so the webhook payload always contains reelId without a DB lookup.
            UserMetadata: { reelId, userId },
        };

        const response = await this.mediaConvert.send(
            new CreateJobCommand(jobInput),
        );

        const mediaConvertJobId = response.Job?.Id;
        if (!mediaConvertJobId) {
            throw new Error(
                `MediaConvert did not return a Job ID for reel ${reelId}`,
            );
        }

        // Store JSON mapping so the webhook handler can resolve both
        // reelId and userId from the MediaConvert job ID alone.
        const redisKey = `${MEDIA_REDIS_KEYS.JOB_PREFIX}:${mediaConvertJobId}`;
        await this.redis.set(
            redisKey,
            JSON.stringify({ reelId, userId }),
            MEDIA_CACHE_TTL.JOB_MAPPING,
        );

        this.logger.log(
            `MediaConvert job ${mediaConvertJobId} submitted for reel ${reelId}`,
        );
    }
}
