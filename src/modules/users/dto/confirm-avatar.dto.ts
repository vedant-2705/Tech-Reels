/**
 * @module modules/users/dto/confirm-avatar.dto
 * @description
 * Request DTO for PATCH /users/me/avatar/confirm. Carries the S3 object
 * key returned by the avatar upload endpoint.
 */

import { IsString, IsNotEmpty } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * Validates the avatar confirmation payload.
 */
export class ConfirmAvatarDto {
    @ApiProperty({
        example:
            "avatars/019501a0-0000-7000-8000-000000000001/019501a0-0000-7000-8000-000000000002.jpg",
        description:
            "S3 object key received from POST /users/me/avatar. " +
            "Must match the key stored in the pending avatar cache.",
    })
    @IsString()
    @IsNotEmpty()
    avatar_key!: string;
}
