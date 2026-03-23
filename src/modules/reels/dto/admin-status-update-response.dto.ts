/**
 * @module modules/reels/dto/admin-status-update-response.dto
 * @description
 * Response DTO for PATCH /reels/:id/status (admin only).
 * Returns the reel ID, updated status, and timestamp.
 */

import { ApiProperty } from "@nestjs/swagger";
import { REEL_ADMIN_STATUSES } from "../reels.constants";

/**
 * Response returned after an admin status update.
 */
export class AdminStatusUpdateResponseDto {
    @ApiProperty({
        example: "019501a0-0000-7000-8000-000000000001",
        description: "UUID of the reel whose status was updated.",
    })
    id!: string;

    @ApiProperty({
        example: "active",
        description: "New status applied to the reel.",
        enum: REEL_ADMIN_STATUSES,
    })
    status!: string;

    @ApiProperty({
        example: "2026-03-16T11:00:00.000Z",
        description: "ISO 8601 timestamp of when the status was last updated.",
    })
    updated_at!: string;
}
