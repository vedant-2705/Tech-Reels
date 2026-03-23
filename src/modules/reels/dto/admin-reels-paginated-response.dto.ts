/**
 * @module modules/reels/dto/admin-reels-paginated-response.dto
 * @description
 * Response DTO for GET /reels/admin.
 * Wraps paginated reel list with keyset cursor metadata for admin listing.
 */

import { ApiProperty } from "@nestjs/swagger";
import { ReelResponseDto } from "./reel-response.dto";

/**
 * Pagination metadata for the admin reel list.
 */
export class AdminReelsMetaDto {
    @ApiProperty({
        example: "019501a0-0000-7000-8000-000000000005",
        description:
            "UUID v7 cursor to pass as cursor param on the next request. Null when no more pages.",
        nullable: true,
    })
    next_cursor!: string | null;

    @ApiProperty({
        example: true,
        description: "Whether more reels are available beyond this page.",
    })
    has_more!: boolean;
}

/**
 * Paginated response for GET /reels/admin.
 */
export class AdminReelsPaginatedResponseDto {
    @ApiProperty({
        type: [ReelResponseDto],
        description: "List of all reels matching the applied filters.",
    })
    data!: ReelResponseDto[];

    @ApiProperty({
        type: () => AdminReelsMetaDto,
        description: "Pagination metadata.",
    })
    meta!: AdminReelsMetaDto;
}
