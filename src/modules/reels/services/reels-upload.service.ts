/**
 * @module modules/reels/services/reels-upload.service
 * @description
 * Handles reel upload initiation (draft + presigned URL) and confirmation
 * (S3 verification, DB write, video processing enqueue).
 *
 * Owns:
 *   createReel  - distributed lock, tag validation, presigned URL, draft storage
 *   confirmReel - draft verification, S3 check, DB persist, processing enqueue
 */

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { ReelsRepository } from "../reels.repository";
import { RedisService } from "@redis/redis.service";
import { S3Service } from "@s3/s3.service";

import { CreateReelDto } from "../dto/create-reel.dto";
import { ConfirmReelDto } from "../dto/confirm-reel.dto";
import { CreateReelResponseDto } from "../dto/create-reel-response.dto";

import { ReelNotFoundException } from "../exceptions/reel-not-found.exception";
import { InvalidReelKeyException } from "../exceptions/invalid-reel-key.exception";
import { InvalidReelTagsException } from "../exceptions/invalid-reel-tags.exception";
import { UploadInProgressException } from "../exceptions/upload-in-progress.exception";

import { uuidv7 } from "@common/utils/uuidv7.util";
import { buildReelUploadKey } from "../utils/build-reel-upload-key.util";
import {
    REEL_STATUS,
    REELS_ACCEPTED_MIME,
    REELS_LOCKS,
    REELS_MAX_UPLOAD_BYTES,
    REELS_MESSAGES,
    REELS_PRESIGN_EXPIRES_IN,
    REELS_S3_ENV,
} from "../reels.constants";
import { MessagingService, REELS } from "@modules/messaging";

@Injectable()
export class ReelsUploadService {
    private readonly logger = new Logger(ReelsUploadService.name);

    constructor(
        private readonly reelsRepository: ReelsRepository,
        private readonly redis: RedisService,
        private readonly s3Service: S3Service,
        private readonly config: ConfigService,
        private readonly messagingService: MessagingService,
    ) {}

    /**
     * Initiate reel creation - acquire upload lock, validate tags, generate
     * presigned S3 URL, and store draft in Redis.
     */
    async createReel(
        userId: string,
        dto: CreateReelDto,
    ): Promise<CreateReelResponseDto> {
        const lockKey = `${REELS_LOCKS.UPLOAD_PREFIX}:${userId}`;

        const acquired = await this.redis.setNx(
            lockKey,
            "1",
            REELS_LOCKS.UPLOAD_TTL,
        );
        if (!acquired) {
            throw new UploadInProgressException();
        }

        try {
            const validIds = await this.reelsRepository.validateTagIds(
                dto.tag_ids,
            );
            if (validIds.length !== dto.tag_ids.length) {
                throw new InvalidReelTagsException();
            }

            const reelId = uuidv7();
            const rawKey = buildReelUploadKey(userId, reelId);
            const rawBucket =
                this.config.get<string>(REELS_S3_ENV.RAW_BUCKET) ?? "";

            const { upload_url, expires_at } =
                await this.s3Service.generatePresignedPutUrl(
                    {
                        key: rawKey,
                        contentType: REELS_ACCEPTED_MIME,
                        maxSizeBytes: REELS_MAX_UPLOAD_BYTES,
                        expiresIn: REELS_PRESIGN_EXPIRES_IN,
                    },
                    rawBucket,
                );

            await this.reelsRepository.setDraft(reelId, {
                creatorId: userId,
                title: dto.title,
                description: dto.description,
                difficulty: dto.difficulty,
                tagIds: dto.tag_ids,
                rawKey,
            });

            return { reel_id: reelId, upload_url, raw_key: rawKey, expires_at };
        } finally {
            await this.redis.del(lockKey);
        }
    }

    /**
     * Confirm a reel upload - verify draft, S3 object, persist to DB,
     * enqueue video processing.
     */
    async confirmReel(
        userId: string,
        reelId: string,
        dto: ConfirmReelDto,
    ): Promise<{ reel_id: string; status: string; message: string }> {
        const draft = await this.reelsRepository.getDraft(reelId);
        if (!draft) {
            throw new InvalidReelKeyException();
        }

        if (draft.creatorId !== userId) {
            throw new ReelNotFoundException();
        }

        if (draft.rawKey !== dto.raw_key) {
            throw new InvalidReelKeyException();
        }

        const rawBucket =
            this.config.get<string>(REELS_S3_ENV.RAW_BUCKET) ?? "";
        const exists = await this.s3Service.objectExists(
            dto.raw_key,
            rawBucket,
        );
        if (!exists) {
            throw new InvalidReelKeyException();
        }

        await this.reelsRepository.createWithTags({
            id: reelId,
            creatorId: draft.creatorId,
            title: draft.title,
            description: draft.description,
            difficulty: draft.difficulty,
            tagIds: draft.tagIds,
        });

        await this.reelsRepository.deleteDraft(reelId);

        void this.messagingService.dispatchJob(REELS.QUEUE_JOBS.VIDEO_PROCESS, {
            reelId,
            rawKey: dto.raw_key,
            userId,
        });

        return {
            reel_id: reelId,
            status: REEL_STATUS.PROCESSING,
            message: REELS_MESSAGES.CONFIRM,
        };
    }
}
