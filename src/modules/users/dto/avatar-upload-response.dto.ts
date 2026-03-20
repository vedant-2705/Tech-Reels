/**
 * @module modules/users/dto/avatar-upload-response.dto
 * @description
 * Response DTO returned by POST /users/me/avatar containing the
 * presigned S3 PUT URL and the avatar key to pass to the confirm
 * endpoint.
 */

import { ApiProperty } from "@nestjs/swagger";

/**
 * Avatar presigned upload URL response envelope.
 */
export class AvatarUploadResponseDto {
    @ApiProperty({
        example: "https://techreel-cdn.s3.amazonaws.com/avatars/...",
        description: "Presigned S3 PUT URL. Valid for 5 minutes (300 seconds).",
    })
    upload_url!: string;

    @ApiProperty({
        example:
            "avatars/019501a0-0000-7000-8000-000000000001/019501a0-0000-7000-8000-000000000002.jpg",
        description:
            "S3 object key for the uploaded avatar. Pass this to PATCH /users/me/avatar/confirm.",
    })
    avatar_key!: string;

    @ApiProperty({
        example: "2026-03-16T10:05:00.000Z",
        description: "ISO 8601 timestamp when the presigned URL expires.",
    })
    expires_at!: string;
}
