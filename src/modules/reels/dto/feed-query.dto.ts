/**
 * @module modules/reels/dto/feed-query.dto
 * @description
 * Query parameters DTO for GET /reels/feed.
 * Uses integer cursor (position in the Redis List) for pagination.
 */

import { IsInt, IsOptional, Max, Min } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";

/**
 * Query params for reading the personalised reel feed.
 */
export class FeedQueryDto {
    @ApiPropertyOptional({
        example: 0,
        description:
            "Integer position in the feed list to start reading from. Default 0 (start of list).",
        minimum: 0,
        default: 0,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    @Transform(({ value }) =>
        value === undefined ? 0 : parseInt(value as string, 10),
    )
    cursor?: number = 0;

    @ApiPropertyOptional({
        example: 10,
        description:
            "Number of feed items to return per page. Default 10, max 20.",
        minimum: 1,
        maximum: 20,
        default: 10,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(20)
    @Transform(({ value }) =>
        value === undefined ? 10 : parseInt(value as string, 10),
    )
    limit?: number = 10;
}
