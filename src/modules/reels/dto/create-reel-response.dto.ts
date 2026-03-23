/**
 * @module modules/reels/dto/create-reel-response.dto
 * @description
 * Response DTO for POST /reels (201 Created).
 * Returns the reel ID, presigned S3 PUT URL, raw S3 key,
 * and URL expiry timestamp.
 */

import { ApiProperty } from "@nestjs/swagger";

/**
 * Response returned after successfully initiating a reel upload.
 */
export class CreateReelResponseDto {
    @ApiProperty({
        example: "019501a0-0000-7000-8000-000000000001",
        description: "UUID v7 of the newly created reel row.",
    })
    reel_id!: string;

    @ApiProperty({
        example:
            "https://techreel-raw.s3.amazonaws.com/reels/019501a0-0000-7000-8000-000000000001/raw.mp4?X-Amz-Signature=...",
        description:
            "Presigned S3 PUT URL the client must use to upload the raw video. Valid for 15 minutes.",
    })
    upload_url!: string;

    @ApiProperty({
        example: "reels/019501a0-0000-7000-8000-000000000001/raw.mp4",
        description:
            "S3 object key of the raw video. Must be passed to POST /reels/:id/confirm.",
    })
    raw_key!: string;

    @ApiProperty({
        example: "2026-03-16T10:15:00.000Z",
        description:
            "ISO 8601 timestamp when the presigned URL expires (15 minutes from creation).",
    })
    expires_at!: string;
}
