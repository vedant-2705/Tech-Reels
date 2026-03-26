/**
 * @module modules/reels/dto/liked-reels-paginated-response.dto
 * @description
 * Response DTO for GET /reels/liked.
 */

import { ApiProperty } from "@nestjs/swagger";
import { InteractedReelItemDto } from "./interacted-reel-item.dto";

/**
 * Pagination metadata for the liked reels list.
 */
export class LikedReelsMetaDto {
    @ApiProperty({
        example:
            "eyJ0aW1lc3RhbXAiOiIyMDI2LTAzLTE2VDEwOjAwOjAwLjAwMFoiLCJpZCI6IjAxOTUwMWEwIn0=",
        description:
            "Base64-encoded compound cursor for the next page. Null when no more pages.",
        nullable: true,
    })
    next_cursor!: string | null;

    @ApiProperty({
        example: true,
        description: "Whether more liked reels are available beyond this page.",
    })
    has_more!: boolean;
}

/**
 * Paginated response for GET /reels/liked.
 */
export class LikedReelsPaginatedResponseDto {
    @ApiProperty({
        type: [InteractedReelItemDto],
        description:
            "Reels liked by the authenticated user, most recently liked first.",
    })
    data!: InteractedReelItemDto[];

    @ApiProperty({
        type: () => LikedReelsMetaDto,
        description: "Pagination metadata.",
    })
    meta!: LikedReelsMetaDto;
}
