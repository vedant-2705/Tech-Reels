/**
 * @module modules/admin/dto/admin-reel-status-update.dto
 * @description
 * Request and response DTOs for PATCH /admin/reels/:id/status.
 */

import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ADMIN_REEL_STATUSES, type AdminReelStatus } from "../admin.constants";

/**
 * Request body for the admin reel status update endpoint.
 */
export class AdminReelStatusUpdateDto {
    @ApiProperty({
        example: "disabled",
        description:
            "New reel status. One of: active, disabled, needs_review. " +
            '"featured" is NOT a valid value - it does not exist in the reel_status DB enum.',
        enum: ADMIN_REEL_STATUSES,
    })
    @IsEnum(ADMIN_REEL_STATUSES)
    status!: AdminReelStatus;

    @ApiPropertyOptional({
        example: "Reel contains prohibited content.",
        description:
            "Optional note explaining the status change. Included in creator notification when disabling.",
        maxLength: 500,
    })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    note?: string;
}

/**
 * Response body after a successful admin reel status update.
 */
export class AdminReelStatusResponseDto {
    @ApiProperty({
        example: "019501a0-0000-7000-8000-000000000010",
        description: "UUID of the updated reel.",
    })
    reel_id!: string;

    @ApiProperty({
        example: "disabled",
        description: "New status applied to the reel.",
    })
    status!: string;

    @ApiProperty({
        example: "2026-03-31T14:00:00.000Z",
        description: "ISO 8601 timestamp of the update.",
    })
    updated_at!: string;
}
