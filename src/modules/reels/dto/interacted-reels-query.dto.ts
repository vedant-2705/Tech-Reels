/**
 * @module modules/reels/dto/interacted-reels-query.dto
 * @description
 * Query params DTO shared by GET /reels/liked and GET /reels/saved.
 * Uses a compound base64 cursor encoding { timestamp, id } for stable
 * keyset pagination on the interaction tables.
 */

import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";

/**
 * Pagination query params for liked and saved reel list endpoints.
 */
export class InteractedReelsQueryDto {
    @ApiPropertyOptional({
        example:
            "eyJ0aW1lc3RhbXAiOiIyMDI2LTAzLTE2VDEwOjAwOjAwLjAwMFoiLCJpZCI6IjAxOTUwMWEwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDAwMSJ9",
        description:
            "Base64-encoded compound cursor { timestamp: string, id: string }. " +
            "Omit on first request.",
    })
    @IsOptional()
    @IsString()
    cursor?: string;

    @ApiPropertyOptional({
        example: 20,
        description:
            "Number of results to return. Min 1, max 50. Defaults to 20.",
        default: 20,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(50)
    @Type(() => Number)
    limit?: number = 20;
}
