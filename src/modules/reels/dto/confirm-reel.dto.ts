/**
 * @module modules/reels/dto/confirm-reel.dto
 * @description
 * Request body DTO for POST /reels/:id/confirm.
 * The client passes the raw S3 key received from the create endpoint.
 */

import { IsNotEmpty, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * Payload for confirming a completed S3 video upload.
 */
export class ConfirmReelDto {
    @ApiProperty({
        example: "reels/019501a0-0000-7000-8000-000000000001/raw.mp4",
        description:
            "S3 object key of the uploaded raw video. Must match the raw_key returned by POST /reels.",
    })
    @IsString()
    @IsNotEmpty()
    raw_key!: string;
}
