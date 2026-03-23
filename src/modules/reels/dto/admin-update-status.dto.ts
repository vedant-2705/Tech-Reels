/**
 * @module modules/reels/dto/admin-update-status.dto
 * @description
 * Request body DTO for PATCH /reels/:id/status (admin only).
 */

import { IsEnum } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { REEL_ADMIN_STATUSES, type ReelAdminStatus } from "../reels.constants";

/**
 * Admin status update payload.
 */
export class AdminUpdateStatusDto {
    @ApiProperty({
        example: "active",
        description:
            "New reel status. Admin may set active (approves reel), disabled (hides reel), or needs_review (flags for review).",
        enum: REEL_ADMIN_STATUSES,
    })
    @IsEnum(REEL_ADMIN_STATUSES)
    status!: ReelAdminStatus;
}
