/**
 * @module modules/reels/dto/update-reel.dto
 * @description
 * Request body DTO for PATCH /reels/:id. All fields are optional.
 * Providing tag_ids replaces all existing tags for the reel.
 */

import {
    IsArray,
    IsEnum,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    ArrayMinSize,
    ArrayMaxSize,
    IsNotEmpty,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { REEL_DIFFICULTIES, type ReelDifficulty } from "../reels.constants";

/**
 * Partial update payload for an existing reel.
 * At least one field should be provided - empty body is a no-op.
 */
export class UpdateReelDto {
    @ApiPropertyOptional({
        example: "Updated: React hooks deep dive",
        description: "New title for the reel. Max 150 characters.",
        maxLength: 150,
    })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(150)
    title?: string;

    @ApiPropertyOptional({
        example: "Covers useState, useEffect, and custom hooks.",
        description: "New description for the reel. Max 500 characters.",
        maxLength: 500,
    })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    description?: string;

    @ApiPropertyOptional({
        example: "advanced",
        description: "New difficulty level for the reel.",
        enum: REEL_DIFFICULTIES,
    })
    @IsOptional()
    @IsEnum(REEL_DIFFICULTIES)
    difficulty?: ReelDifficulty;

    @ApiPropertyOptional({
        example: [
            "019501a0-0000-7000-8000-000000000001",
            "019501a0-0000-7000-8000-000000000003",
        ],
        description:
            "Replacement tag UUID list. When provided, all existing tags are deleted and replaced. Min 1, max 5.",
        type: [String],
        minItems: 1,
        maxItems: 5,
    })
    @IsOptional()
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(5)
    @IsUUID("all", { each: true })
    tag_ids?: string[];
}
