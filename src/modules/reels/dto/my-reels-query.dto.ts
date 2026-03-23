/**
 * @module modules/reels/dto/my-reels-query.dto
 * @description
 * Query parameters DTO for GET /reels/me.
 * Supports keyset cursor pagination and optional status filtering.
 */

import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { REEL_STATUSES, type ReelStatus } from "../reels.constants";

/**
 * Query params for listing the authenticated creator's own reels.
 */
export class MyReelsQueryDto {
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
            "Maximum number of reels to return per page. Default 20, max 50.",
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
