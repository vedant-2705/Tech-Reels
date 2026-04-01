/**
 * @module modules/admin/dto/action-report.dto
 * @description
 * Request and response DTOs for PATCH /admin/reports/:id.
 */

import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { REPORT_ACTIONS, type ReportAction } from "../admin.constants";

/**
 * Request body for actioning a moderation report.
 */
export class ActionReportDto {
    @ApiProperty({
        example: "disable_reel",
        description:
            "Action to take on this report. " +
            "dismiss: close without action. " +
            "disable_reel: disable the reel and notify creator. " +
            "warn_creator: notify creator without disabling. " +
            "escalate: flag for senior review.",
        enum: REPORT_ACTIONS,
    })
    @IsEnum(REPORT_ACTIONS)
    action!: ReportAction;

    @ApiPropertyOptional({
        example: "Verified policy violation - repeated offence.",
        description:
            "Optional note attached to the action. Sent in creator notification where applicable.",
        maxLength: 500,
    })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    note?: string;
}

/**
 * Response body after a successful report action.
 */
export class ActionReportResponseDto {
    @ApiProperty({
        example: "019501a0-0000-7000-8000-000000000020",
        description: "UUID of the actioned report.",
    })
    report_id!: string;

    @ApiProperty({
        example: "disable_reel",
        description: "The action that was taken.",
    })
    action_taken!: string;

    @ApiProperty({
        example: "2026-03-31T14:00:00.000Z",
        description: "ISO 8601 timestamp when the action was recorded.",
    })
    reviewed_at!: string;
}
