/**
 * @module modules/users/dto/confirm-avatar-response.dto
 * @description
 * Response DTO returned by PATCH /users/me/avatar/confirm after the
 * avatar has been verified in S3 and the user record updated.
 */

import { ApiProperty } from "@nestjs/swagger";

/**
 * Avatar confirmation response envelope.
 */
export class ConfirmAvatarResponseDto {
    @ApiProperty({
        example:
            "https://cdn.techreel.io/avatars/019501a0-0000-7000-8000-000000000001/019501a0-0000-7000-8000-000000000002.jpg",
        description: "Full CDN URL of the newly confirmed avatar.",
    })
    avatar_url!: string;
}
