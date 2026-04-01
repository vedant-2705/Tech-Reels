/**
 * @module modules/admin/dto/xp-grant.dto
 * @description
 * Request and response DTOs for POST /admin/users/:id/xp.
 */

import { IsInt, IsString, Max, MaxLength, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * Request body for granting or revoking XP on behalf of an admin.
 */
export class XpGrantDto {
    @ApiProperty({
        example: 100,
        description:
            "XP delta to apply. Positive = grant, negative = revoke. " +
            "Range: -10000 to 10000. Actual write is performed by the XP worker.",
        minimum: -10000,
        maximum: 10000,
    })
    @IsInt()
    @Min(-10000)
    @Max(10000)
    delta!: number;

    @ApiProperty({
        example: "Compensation for platform outage on 2026-03-28.",
        description:
            "Required note explaining the XP adjustment. Stored in xp_ledger.note.",
        maxLength: 500,
    })
    @IsString()
    @MaxLength(500)
    note!: string;
}

/**
 * Response body after a successful XP grant/revoke.
 * new_total_xp is optimistic - reflects current_xp + delta before the worker runs.
 */
export class XpGrantResponseDto {
    @ApiProperty({
        example: "019501a0-0000-7000-8000-000000000001",
        description: "UUID of the user whose XP was adjusted.",
    })
    user_id!: string;

    @ApiProperty({
        example: 100,
        description: "XP delta applied (positive or negative).",
    })
    delta!: number;

    @ApiProperty({
        example: 1340,
        description:
            "Optimistic new total XP (current_xp + delta). " +
            "Actual persisted value is written asynchronously by the XP worker.",
    })
    new_total_xp!: number;
}
