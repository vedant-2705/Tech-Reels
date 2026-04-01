/**
 * @module modules/admin/dto/analytics-summary.dto
 * @description
 * Response shape for GET /admin/analytics/summary.
 */

import { ApiProperty } from "@nestjs/swagger";

export class UserSummaryDto {
    @ApiProperty({
        example: 5000,
        description: "Total registered users (including soft-deleted).",
    })
    total!: number;

    @ApiProperty({
        example: 120,
        description: "Users with last_active_date = today (UTC).",
    })
    active_today!: number;

    @ApiProperty({
        example: 34,
        description: "Users registered in the past 7 days.",
    })
    new_this_week!: number;

    @ApiProperty({
        example: 8,
        description: "Users with account_status = suspended.",
    })
    suspended!: number;

    @ApiProperty({
        example: 2,
        description: "Users with account_status = banned.",
    })
    banned!: number;
}

export class ReelSummaryDto {
    @ApiProperty({
        example: 800,
        description: "Total reels (including soft-deleted).",
    })
    total!: number;

    @ApiProperty({ example: 640, description: "Reels with status = active." })
    active!: number;

    @ApiProperty({
        example: 12,
        description: "Reels with status = processing.",
    })
    processing!: number;

    @ApiProperty({ example: 9, description: "Reels with status = disabled." })
    disabled!: number;

    @ApiProperty({
        example: 5,
        description: "Reels with status = needs_review.",
    })
    pending_review!: number;
}

export class ChallengeSummaryDto {
    @ApiProperty({
        example: 1200,
        description: "Total non-deleted challenges.",
    })
    total!: number;

    @ApiProperty({
        example: 48200,
        description: "Total challenge attempts across all users.",
    })
    total_attempts!: number;

    @ApiProperty({
        example: 0.72,
        description: "Ratio of correct attempts to total attempts. 0.0-1.0.",
    })
    correct_rate!: number;
}

export class ReportSummaryDto {
    @ApiProperty({ example: 17, description: "Reports with status = pending." })
    pending!: number;

    @ApiProperty({
        example: 41,
        description: "Total reports submitted in the past 7 days.",
    })
    this_week!: number;
}

export class XpSummaryDto {
    @ApiProperty({
        example: 4800,
        description: "Total XP awarded today (UTC) via all sources.",
    })
    total_awarded_today!: number;
}

/**
 * Full analytics summary response.
 */
export class AnalyticsSummaryDto {
    @ApiProperty({
        type: () => UserSummaryDto,
        description: "User statistics.",
    })
    users!: UserSummaryDto;

    @ApiProperty({
        type: () => ReelSummaryDto,
        description: "Reel statistics.",
    })
    reels!: ReelSummaryDto;

    @ApiProperty({
        type: () => ChallengeSummaryDto,
        description: "Challenge and attempt statistics.",
    })
    challenges!: ChallengeSummaryDto;

    @ApiProperty({
        type: () => ReportSummaryDto,
        description: "Moderation report statistics.",
    })
    reports!: ReportSummaryDto;

    @ApiProperty({ type: () => XpSummaryDto, description: "XP statistics." })
    xp!: XpSummaryDto;
}
