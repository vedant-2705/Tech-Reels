/**
 * @module modules/admin/dto/user-status-update.dto
 * @description
 * Request and response DTOs for PATCH /admin/users/:id/status.
 */

import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ADMIN_USER_STATUSES, type AdminUserStatus } from "../admin.constants";

/**
 * Request body for updating a user's account status.
 */
export class UserStatusUpdateDto {
    @ApiProperty({
        example: "suspended",
        description:
            "New account status to apply. One of: suspended, banned, active, deactivated.",
        enum: ADMIN_USER_STATUSES,
    })
    @IsEnum(ADMIN_USER_STATUSES)
    status!: AdminUserStatus;

    @ApiPropertyOptional({
        example: "Repeated policy violations on uploaded content.",
        description:
            "Optional reason for the status change. Stored in audit log and sent in notification.",
        maxLength: 500,
    })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    reason?: string;
}

/**
 * Response body after a successful user status update.
 */
export class UserStatusUpdateResponseDto {
    @ApiProperty({
        example: "019501a0-0000-7000-8000-000000000001",
        description: "UUID of the updated user.",
    })
    id!: string;

    @ApiProperty({
        example: "suspended",
        description: "New account status applied.",
    })
    account_status!: string;

    @ApiProperty({
        example: "2026-03-31T12:00:00.000Z",
        description: "ISO 8601 timestamp of the update.",
    })
    updated_at!: string;
}
