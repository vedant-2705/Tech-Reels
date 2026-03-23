/**
 * @module modules/reels/dto/report-reel.dto
 * @description
 * Request body DTO for POST /reels/:id/report.
 */

import {
    IsEnum,
    IsOptional,
    IsString,
    MaxLength,
    IsNotEmpty,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { REEL_REPORT_REASONS, type ReelReportReason } from "../reels.constants";

/**
 * Report submission payload.
 */
export class ReportReelDto {
    @ApiProperty({
        example: "spam",
        description:
            "Category of the report (spam, misleading, inappropriate, hate_speech, illegal_content, other).",
        enum: REEL_REPORT_REASONS,
    })
    @IsEnum(REEL_REPORT_REASONS)
    reason!: ReelReportReason;

    @ApiPropertyOptional({
        example:
            "This reel repeatedly links to external spam sites in the description.",
        description:
            "Optional free-text context for the report. Max 500 characters.",
        maxLength: 500,
    })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    details?: string;
}
