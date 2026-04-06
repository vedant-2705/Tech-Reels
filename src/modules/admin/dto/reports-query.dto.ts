/**
 * @module modules/admin/dto/reports-query.dto
 * @description
 * Query parameters DTO for GET /admin/reports.
 * Extends CursorPaginationDto for standard cursor + limit.
 * Overrides default limit to 50 (admin endpoints show more items per page).
 */

import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { CursorPaginationDto } from "@common/dto/cursor-pagination.dto";
import {
    REPORT_STATUSES,
    type ReportStatus,
    REPORT_STATUS,
} from "../admin.constants";

/**
 * Valid report reason strings - mirrors the report_reason DB enum.
 */
const REPORT_REASONS = [
    "spam",
    "misleading",
    "inappropriate",
    "hate_speech",
    "illegal_content",
    "other",
] as const;

type ReportReason = (typeof REPORT_REASONS)[number];

/**
 * Query params for the admin reports list endpoint.
 */
export class ReportsQueryDto extends CursorPaginationDto {
    @ApiPropertyOptional({
        example: "pending",
        description:
            'Filter by report status. Defaults to "pending" when omitted.',
        enum: REPORT_STATUSES,
        default: REPORT_STATUS.PENDING,
    })
    @IsOptional()
    @IsEnum(REPORT_STATUSES)
    status?: ReportStatus = REPORT_STATUS.PENDING;

    @ApiPropertyOptional({
        example: "spam",
        description: "Filter by report reason.",
        enum: REPORT_REASONS,
    })
    @IsOptional()
    @IsEnum(REPORT_REASONS)
    reason?: ReportReason;

    @ApiPropertyOptional({
        example: 50,
        description:
            "Number of reports to return per page. Default 50, max 100.",
        minimum: 1,
        maximum: 100,
        default: 50,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    override limit?: number = 50;
}
