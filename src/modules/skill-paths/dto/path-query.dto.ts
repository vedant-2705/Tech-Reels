import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
    SKILL_PATH_DIFFICULTIES,
    type SkillPathDifficulty,
} from "../skill-paths.constants";

/**
 * Query parameters for GET /skill-paths (published path list).
 */
export class PathQueryDto {
    @ApiPropertyOptional({
        description: "Filter by difficulty level",
        enum: SKILL_PATH_DIFFICULTIES,
    })
    @IsOptional()
    @IsEnum(SKILL_PATH_DIFFICULTIES)
    difficulty?: SkillPathDifficulty;

    @ApiPropertyOptional({
        description: "UUID of the last seen path for cursor pagination",
    })
    @IsOptional()
    @IsUUID()
    cursor?: string;

    @ApiPropertyOptional({
        description: "Number of results to return (default 20, max 50)",
        minimum: 1,
        maximum: 50,
        default: 20,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    limit?: number;
}
