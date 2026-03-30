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
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
    SKILL_PATH_DIFFICULTIES,
    SKILL_PATH_MAX_REELS,
    SKILL_PATH_MIN_REELS,
    type SkillPathDifficulty,
} from "../skill-paths.constants";

/**
 * Request body for POST /skill-paths (admin only).
 *
 * reel_ids: ordered array of reel UUIDs. The position in the array determines
 * the order field in skill_path_reels (1-indexed). Must be active reels only -
 * service validates via validateReelIds() and throws InvalidPathReelsException
 * if any ID is invalid or not active.
 *
 * thumbnail_url: optional cover image URL for the path. This is a full URL
 * (not an S3 key) - admin provides it directly. Distinct from reel thumbnail_key.
 */
export class CreatePathDto {
    @ApiProperty({ description: "Path title", minLength: 5, maxLength: 150 })
    @IsString()
    @IsNotEmpty()
    @MinLength(5)
    @MaxLength(150)
    title!: string;

    @ApiProperty({ description: "Path description", maxLength: 1000 })
    @IsString()
    @IsNotEmpty()
    @MaxLength(1000)
    description!: string;

    @ApiProperty({
        description: "Difficulty level",
        enum: SKILL_PATH_DIFFICULTIES,
    })
    @IsEnum(SKILL_PATH_DIFFICULTIES)
    difficulty!: SkillPathDifficulty;

    @ApiProperty({
        description: `Ordered array of active reel UUIDs (min ${SKILL_PATH_MIN_REELS}, max ${SKILL_PATH_MAX_REELS}). Order determines position in path.`,
        type: [String],
        minItems: SKILL_PATH_MIN_REELS,
        maxItems: SKILL_PATH_MAX_REELS,
    })
    @IsArray()
    @ArrayMinSize(SKILL_PATH_MIN_REELS)
    @ArrayMaxSize(SKILL_PATH_MAX_REELS)
    @IsUUID("all", { each: true })
    reel_ids!: string[];

    @ApiPropertyOptional({
        description: "Cover image URL for this path (full URL, not an S3 key)",
    })
    @IsOptional()
    @IsUrl()
    thumbnail_url?: string;

    @ApiPropertyOptional({
        description:
            "Whether the path is immediately visible to users (default false)",
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    is_published?: boolean;
}
