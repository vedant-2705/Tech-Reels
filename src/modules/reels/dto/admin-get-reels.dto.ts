/**
 * @module modules/reels/dto/admin-get-reels.dto
 * @description
 * Query parameters DTO for GET /reels/admin (admin only).
 * Supports optional filtering by status and creator, plus cursor pagination.
 */

import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { REEL_STATUSES, type ReelStatus } from "../reels.constants";

/**
 * Admin reel list query parameters.
 */
export class AdminGetReelsDto {
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

    @ApiPropertyOptional({
        example: "019501a0-0000-7000-8000-000000000001",
        description:
            "Cursor UUID v7 from the last reel returned in the previous page. Omit for the first page.",
    })
    @IsOptional()
    @IsUUID()
    cursor?: string;

    @ApiPropertyOptional({
        example: 20,
        description:
            "Maximum number of results to return per page. Default 20, max 50.",
        minimum: 1,
        maximum: 50,
        default: 20,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    @Transform(({ value }) =>
        value === undefined ? 20 : parseInt(value as string, 10),
    )
    limit?: number = 20;
}
