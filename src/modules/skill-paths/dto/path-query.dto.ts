/**
 * @module modules/skill-paths/dto/path-query.dto
 * @description
 * Query parameters for GET /skill-paths (published path list).
 * Extends CursorPaginationDto for standard cursor + limit, adds difficulty filter.
 */

import { IsEnum, IsOptional } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { CursorPaginationDto } from "@common/dto/cursor-pagination.dto";
import {
    SKILL_PATH_DIFFICULTIES,
    type SkillPathDifficulty,
} from "../skill-paths.constants";

/**
 * Query parameters for GET /skill-paths (published path list).
 */
export class PathQueryDto extends CursorPaginationDto {
    @ApiPropertyOptional({
        description: "Filter by difficulty level",
        enum: SKILL_PATH_DIFFICULTIES,
    })
    @IsOptional()
    @IsEnum(SKILL_PATH_DIFFICULTIES)
    difficulty?: SkillPathDifficulty;
}
