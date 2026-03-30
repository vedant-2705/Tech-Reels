import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUrl,
    IsUUID,
    MaxLength,
    MinLength,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import {
    SKILL_PATH_DIFFICULTIES,
    SKILL_PATH_MAX_REELS,
    SKILL_PATH_MIN_REELS,
    type SkillPathDifficulty,
} from "../skill-paths.constants";

/**
 * Request body for PATCH /skill-paths/:id (admin only).
 *
 * All fields are optional. Only provided fields are updated (COALESCE in SQL).
 *
 * reel_ids: when provided, REPLACES the entire ordered reel list atomically
 * in a transaction (DELETE all + INSERT new). Partial updates to the reel
 * list are not supported - the admin must always provide the full desired list.
 *
 * is_published: toggling from false → true makes the path visible to users
 * and invalidates the path list cache. Toggling true → false hides it.
 */
export class UpdatePathDto {
    @ApiPropertyOptional({
        description: "Path title",
        minLength: 5,
        maxLength: 150,
    })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MinLength(5)
    @MaxLength(150)
    title?: string;

    @ApiPropertyOptional({ description: "Path description", maxLength: 1000 })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(1000)
    description?: string;

    @ApiPropertyOptional({
        description: "Difficulty level",
        enum: SKILL_PATH_DIFFICULTIES,
    })
    @IsOptional()
    @IsEnum(SKILL_PATH_DIFFICULTIES)
    difficulty?: SkillPathDifficulty;

    @ApiPropertyOptional({
        description: `Full replacement ordered reel list (min ${SKILL_PATH_MIN_REELS}, max ${SKILL_PATH_MAX_REELS})`,
        type: [String],
        minItems: SKILL_PATH_MIN_REELS,
        maxItems: SKILL_PATH_MAX_REELS,
    })
    @IsOptional()
    @IsArray()
    @ArrayMinSize(SKILL_PATH_MIN_REELS)
    @ArrayMaxSize(SKILL_PATH_MAX_REELS)
    @IsUUID("all", { each: true })
    reel_ids?: string[];

    @ApiPropertyOptional({
        description: "Cover image URL for this path (full URL, not an S3 key)",
    })
    @IsOptional()
    @IsUrl()
    thumbnail_url?: string;

    @ApiPropertyOptional({
        description: "Whether the path is visible to users",
    })
    @IsOptional()
    @IsBoolean()
    is_published?: boolean;
}
