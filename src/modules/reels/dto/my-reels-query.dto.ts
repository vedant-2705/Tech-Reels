/**
 * @module modules/reels/dto/my-reels-query.dto
 * @description
 * Query parameters DTO for GET /reels/me.
 * Extends CursorPaginationDto for standard cursor + limit, adds status filter.
 */

import { IsEnum, IsOptional } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { CursorPaginationDto } from "@common/dto/cursor-pagination.dto";
import { REEL_STATUSES, type ReelStatus } from "../reels.constants";

/**
 * Query params for listing the authenticated creator's own reels.
 */
export class MyReelsQueryDto extends CursorPaginationDto {
    @ApiPropertyOptional({
        example: "active",
        description:
            "Filter reels by status. When omitted, all statuses are returned.",
        enum: REEL_STATUSES,
    })
    @IsOptional()
    @IsEnum(REEL_STATUSES)
    status?: ReelStatus;
}
