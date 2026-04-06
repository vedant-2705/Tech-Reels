/**
 * @module modules/reels/dto/admin-get-reels.dto
 * @description
 * Query parameters DTO for GET /reels/admin (admin only).
 * Extends CursorPaginationDto for standard cursor + limit, adds status and creator filters.
 */

import { IsEnum, IsOptional, IsUUID } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { CursorPaginationDto } from "@common/dto/cursor-pagination.dto";
import { REEL_STATUSES, type ReelStatus } from "../reels.constants";

/**
 * Admin reel list query parameters.
 */
export class AdminGetReelsDto extends CursorPaginationDto {
    @ApiPropertyOptional({
        example: "needs_review",
        description:
            "Filter results to a specific reel status. When omitted, all statuses are returned.",
        enum: REEL_STATUSES,
    })
    @IsOptional()
    @IsEnum(REEL_STATUSES)
    status?: ReelStatus;

    @ApiPropertyOptional({
        example: "019501a0-0000-7000-8000-000000000001",
        description: "Filter results to reels created by a specific user UUID.",
    })
    @IsOptional()
    @IsUUID()
    creator_id?: string;
}
