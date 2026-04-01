/**
 * @module modules/admin/dto/admin-report-item.dto
 * @description
 * Response shape for a single report row in GET /admin/reports list,
 * and the paginated wrapper.
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Reporter snapshot embedded in a report item.
 */
export class ReportReporterDto {
    @ApiProperty({
        example: "019501a0-0000-7000-8000-000000000001",
        description: "Reporter user UUID.",
    })
    id!: string;

    @ApiProperty({
        example: "alice_dev",
        description: "Reporter username.",
    })
    username!: string;
}

/**
 * Reported reel snapshot embedded in a report item.
 */
export class ReportReelDto {
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
        example: "bob_codes",
        description: "Username of the reel creator.",
    })
    creator_username!: string;

    @ApiProperty({
        example: "active",
        description: "Current status of the reel.",
    })
    status!: string;
}

/**
 * Single report item in the admin reports list response.
 */
export class AdminReportItemDto {
    @ApiProperty({
        example: "019501a0-0000-7000-8000-000000000020",
        description: "Report UUID.",
    })
    id!: string;

    @ApiProperty({
        example: "spam",
        description: "Reason category for the report.",
    })
    reason!: string;

    @ApiPropertyOptional({
        example: "This video is clearly spam advertising.",
        description:
            "Optional free-text detail provided by the reporter. Null if not provided.",
        nullable: true,
    })
    details!: string | null;

    @ApiProperty({
        example: "pending",
        description: "Current status of the report.",
    })
    status!: string;

    @ApiProperty({
        type: () => ReportReporterDto,
        description: "Reporter user snapshot.",
    })
    reporter!: ReportReporterDto;

    @ApiProperty({
        type: () => ReportReelDto,
        description: "Reported reel snapshot.",
    })
    reel!: ReportReelDto;

    @ApiProperty({
        example: "2026-03-30T09:00:00.000Z",
        description: "ISO 8601 timestamp when the report was submitted.",
    })
    created_at!: string;
}

/**
 * Pagination metadata for the admin reports list.
 */
export class AdminReportsMetaDto {
    @ApiPropertyOptional({
        example: "019501a0-0000-7000-8000-000000000099",
        description:
            "Cursor UUID for the next page. Null when no more results.",
        nullable: true,
    })
    next_cursor!: string | null;

    @ApiProperty({
        example: true,
        description: "Whether more results exist beyond this page.",
    })
    has_more!: boolean;
}

/**
 * Paginated admin reports list response.
 */
export class AdminReportsListResponseDto {
    @ApiProperty({
        type: [AdminReportItemDto],
        description: "Array of report items.",
    })
    data!: AdminReportItemDto[];

    @ApiProperty({
        type: () => AdminReportsMetaDto,
        description: "Pagination metadata.",
    })
    meta!: AdminReportsMetaDto;
}
