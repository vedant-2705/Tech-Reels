/**
 * @module modules/admin/dto/top-reels-query.dto
 * @description
 * Query parameters and response DTOs for GET /admin/analytics/top-reels.
 */

import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
    ANALYTICS_PERIODS,
    TOP_REELS_SORTS,
    type AnalyticsPeriod,
    type TopReelsSort,
    ANALYTICS_PERIOD,
    TOP_REELS_SORT,
} from "../admin.constants";

/**
 * Query params for the top reels analytics endpoint.
 */
export class TopReelsQueryDto {
    @ApiPropertyOptional({
        example: "views",
        description:
            "Metric to sort by. One of: views, likes, saves. Default: views.",
        enum: TOP_REELS_SORTS,
        default: TOP_REELS_SORT.VIEWS,
    })
    @IsOptional()
    @IsEnum(TOP_REELS_SORTS)
    sort_by?: TopReelsSort = TOP_REELS_SORT.VIEWS;

    @ApiPropertyOptional({
        example: 20,
        description: "Number of reels to return. Default 20, max 100.",
        minimum: 1,
        maximum: 100,
        default: 20,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number = 20;

    @ApiPropertyOptional({
        example: "all_time",
        description:
            "Time period filter. One of: today, this_week, all_time. Default: all_time. " +
            "Note: view_count is eventually consistent (up to 60s behind).",
        enum: ANALYTICS_PERIODS,
        default: ANALYTICS_PERIOD.ALL_TIME,
    })
    @IsOptional()
    @IsEnum(ANALYTICS_PERIODS)
    period?: AnalyticsPeriod = ANALYTICS_PERIOD.ALL_TIME;
}

/**
 * Single reel item in the top reels analytics response.
 */
export class TopReelItemDto {
    @ApiProperty({
        example: "019501a0-0000-7000-8000-000000000010",
        description: "Reel UUID.",
    })
    id!: string;

    @ApiProperty({
        example: "How to use React hooks",
        description: "Reel title.",
    })
    title!: string;

    @ApiProperty({
        example: "alice_dev",
        description: "Username of the reel creator.",
    })
    creator_username!: string;

    @ApiProperty({
        example: "active",
        description: "Current reel status.",
    })
    status!: string;

    @ApiProperty({
        example: "intermediate",
        description: "Reel difficulty level.",
    })
    difficulty!: string;

    @ApiProperty({
        example: 15200,
        description: "Total view count.",
    })
    view_count!: number;

    @ApiProperty({
        example: 870,
        description: "Total like count.",
    })
    like_count!: number;

    @ApiProperty({
        example: 340,
        description: "Total save count.",
    })
    save_count!: number;

    @ApiProperty({
        example: 3,
        description: "Number of reports submitted against this reel.",
    })
    report_count!: number;

    @ApiProperty({
        example: "2026-03-01T10:00:00.000Z",
        description: "ISO 8601 creation timestamp.",
    })
    created_at!: string;
}

/**
 * Response for GET /admin/analytics/top-reels.
 */
export class TopReelsResponseDto {
    @ApiProperty({
        type: [TopReelItemDto],
        description: "Ranked list of top reels.",
    })
    data!: TopReelItemDto[];
}
