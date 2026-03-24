/**
 * @module modules/media/dto/webhook-payload.dto
 * @description
 * DTO for the HMAC-signed payload posted by the webhook Lambda after
 * AWS EventBridge fires a MediaConvert job state change event.
 * Covers both COMPLETE and ERROR statuses.
 */

import {
    IsString,
    IsIn,
    IsOptional,
    IsNumber,
    ValidateNested,
    IsNotEmpty,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Output paths and metadata populated by MediaConvert on job completion.
 * Present only when status is "COMPLETE".
 */
export class WebhookOutputsDto {
    @ApiProperty({
        example: "reels/019501a0-1234-7000-8000-abcdef123456/master.m3u8",
        description: "S3 key for the HLS master playlist in the CDN bucket.",
    })
    @IsString()
    @IsNotEmpty()
    hls_path!: string;

    @ApiProperty({
        example: "reels/019501a0-1234-7000-8000-abcdef123456/thumbnail.jpg",
        description: "S3 key for the generated thumbnail in the CDN bucket.",
    })
    @IsString()
    @IsNotEmpty()
    thumbnail_key!: string;

    @ApiProperty({
        example: 47,
        description: "Duration of the transcoded video in seconds.",
    })
    @IsNumber()
    duration_seconds!: number;
}

/**
 * Top-level webhook payload from the Lambda relay function.
 *
 * The `reelId` field is passed through from the MediaConvert job's
 * `userMetadata`. The `userId` is NOT included - it is retrieved from
 * the `media:job:{jobId}` Redis cache entry.
 */
export class WebhookPayloadDto {
    @ApiProperty({
        example: "1234567890abcdef-MediaConvert-job-id",
        description:
            "AWS MediaConvert job ID. Used to look up the Redis mapping.",
    })
    @IsString()
    @IsNotEmpty()
    jobId!: string;

    @ApiProperty({
        example: "COMPLETE",
        description: "MediaConvert job terminal status.",
        enum: ["COMPLETE", "ERROR"],
    })
    @IsString()
    @IsIn(["COMPLETE", "ERROR"])
    status!: string;

    @ApiProperty({
        example: "019501a0-1234-7000-8000-abcdef123456",
        description:
            "Reel UUID passed through job userMetadata by the worker. " +
            "Allows the webhook to identify the reel without a DB lookup.",
    })
    @IsString()
    @IsNotEmpty()
    reelId!: string;

    @ApiPropertyOptional({
        nullable: true,
        type: () => WebhookOutputsDto,
        description:
            "Output paths populated by MediaConvert. Present only when status is COMPLETE.",
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => WebhookOutputsDto)
    outputs?: WebhookOutputsDto;

    @ApiPropertyOptional({
        nullable: true,
        example: "Job failed due to unsupported codec",
        description:
            "Error message from MediaConvert. Present only when status is ERROR.",
    })
    @IsOptional()
    @IsString()
    error?: string | null;
}
