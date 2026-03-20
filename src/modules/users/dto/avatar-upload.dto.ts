/**
 * @module modules/users/dto/avatar-upload.dto
 * @description
 * Request DTO for POST /users/me/avatar. Specifies the MIME type of the
 * image to be uploaded so the server can generate a correctly typed
 * presigned S3 PUT URL.
 */

import { IsEnum } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * Permitted avatar image MIME types.
 */
export const AVATAR_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
] as const;
export type AvatarMimeType = (typeof AVATAR_MIME_TYPES)[number];

/**
 * Validates the avatar upload request payload.
 */
export class AvatarUploadDto {
    @ApiProperty({
        example: "image/jpeg",
        description: "MIME type of the image to upload.",
        enum: AVATAR_MIME_TYPES,
    })
    @IsEnum(AVATAR_MIME_TYPES)
    file_type!: AvatarMimeType;
}
