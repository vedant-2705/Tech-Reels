/**
 * @module modules/reels/dto/my-reels-paginated-response.dto
 * @description
 * Response DTO for GET /reels/me.
 * Wraps paginated reel list with keyset cursor metadata.
 */

import { ApiProperty } from "@nestjs/swagger";
import { ReelResponseDto } from "./reel-response.dto";

/**
 * Pagination metadata for the creator's own reel list.
 */
export class MyReelsMetaDto {
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

    @ApiProperty({
        example: 20,
        description: "Number of reels returned in this page.",
    })
    total!: number;
}

/**
 * Paginated response for GET /reels/me.
 */
export class MyReelsPaginatedResponseDto {
    @ApiProperty({
        type: [ReelResponseDto],
        description: "List of reels owned by the authenticated creator.",
    })
    data!: ReelResponseDto[];

    @ApiProperty({
        type: () => MyReelsMetaDto,
        description: "Pagination metadata.",
    })
    meta!: MyReelsMetaDto;
}
