/**
 * @module modules/admin/dto/reports-query.dto
 * @description
 * Query parameters DTO for GET /admin/reports.
 */

import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
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
export class ReportsQueryDto {
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
        example: "019501a0-0000-7000-8000-000000000001",
        description: "UUID v7 cursor for keyset pagination (exclusive).",
    })
    @IsOptional()
    @IsUUID()
    cursor?: string;

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
    limit?: number = 50;
}
