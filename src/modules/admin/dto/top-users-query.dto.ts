/**
 * @module modules/admin/dto/top-users-query.dto
 * @description
 * Query parameters and response DTOs for GET /admin/analytics/top-users.
 */

import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
    TOP_USERS_SORTS,
    type TopUsersSort,
    TOP_USERS_SORT,
} from "../admin.constants";

/**
 * Query params for the top users analytics endpoint.
 */
export class TopUsersQueryDto {
    @ApiPropertyOptional({
        example: "xp",
        description:
            "Metric to sort by. One of: xp, streak, reels_published. Default: xp.",
        enum: TOP_USERS_SORTS,
        default: TOP_USERS_SORT.XP,
    })
    @IsOptional()
    @IsEnum(TOP_USERS_SORTS)
    sort_by?: TopUsersSort = TOP_USERS_SORT.XP;

    @ApiPropertyOptional({
        example: 20,
        description: "Number of users to return. Default 20, max 100.",
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
}

/**
 * Single user item in the top users analytics response.
 */
export class TopUserItemDto {
    @ApiProperty({
        example: "019501a0-0000-7000-8000-000000000001",
        description: "User UUID.",
    })
    id!: string;

    @ApiProperty({
        example: "alice_dev",
        description: "Username.",
    })
    username!: string;

    @ApiProperty({
        example: "alice@example.com",
        description: "User email address.",
    })
    email!: string;

    @ApiProperty({
        example: "active",
        description: "Current account status.",
    })
    account_status!: string;

    @ApiProperty({
        example: 8400,
        description: "Total XP earned.",
    })
    total_xp!: number;

    @ApiProperty({
        example: 42,
        description: "Current daily streak.",
    })
    current_streak!: number;

    @ApiProperty({
        example: 18,
        description: "Number of non-deleted published reels.",
    })
    reels_published!: number;

    @ApiProperty({
        example: "2026-01-15T08:00:00.000Z",
        description: "ISO 8601 account creation timestamp.",
    })
    created_at!: string;
}

/**
 * Response for GET /admin/analytics/top-users.
 */
export class TopUsersResponseDto {
    @ApiProperty({
        type: [TopUserItemDto],
        description: "Ranked list of top users.",
    })
    data!: TopUserItemDto[];
}
