/**
 * @module modules/reels/dto/create-reel.dto
 * @description
 * Request body DTO for POST /reels. Validates creator-supplied metadata
 * and file type before the presigned S3 URL is generated.
 */

import {
    IsArray,
    IsEnum,
    IsNotEmpty,
    IsString,
    IsUUID,
    MaxLength,
    ArrayMinSize,
    ArrayMaxSize,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
    REEL_DIFFICULTIES,
    type ReelAcceptedMime,
    type ReelDifficulty,
    REELS_ACCEPTED_MIME,
} from "../reels.constants";

/**
 * Payload for initiating a reel upload.
 */
export class CreateReelDto {
    @ApiProperty({
        example: "How to use React hooks",
        description: "Human-readable reel title. Max 150 characters.",
        maxLength: 150,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(150)
    title!: string;

    @ApiPropertyOptional({
        example: "A deep dive into useState and useEffect.",
        description: "Optional extended description. Max 500 characters.",
        maxLength: 500,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    description?: string;

    @ApiProperty({
        example: "intermediate",
        description: "Target audience difficulty level.",
        enum: REEL_DIFFICULTIES,
    })
    @IsEnum(REEL_DIFFICULTIES)
    difficulty!: ReelDifficulty;

    @ApiProperty({
        example: [
            "019501a0-0000-7000-8000-000000000001",
            "019501a0-0000-7000-8000-000000000002",
        ],
        description:
            "Tag UUIDs to associate with this reel. Min 1, max 5. Each must be a valid existing tag ID.",
        type: [String],
        minItems: 1,
        maxItems: 5,
    })
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(5)
    @IsUUID("all", { each: true })
    tag_ids!: string[];

    @ApiProperty({
        example: "video/mp4",
        description:
            "MIME type of the video file to be uploaded. Only video/mp4 is accepted.",
        enum: [REELS_ACCEPTED_MIME],
    })
    @IsEnum([REELS_ACCEPTED_MIME])
    file_type!: ReelAcceptedMime;
}
