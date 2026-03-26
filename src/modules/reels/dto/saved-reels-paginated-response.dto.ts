/**
 * @module modules/reels/dto/saved-reels-paginated-response.dto
 * @description
 * Response DTO for GET /reels/saved.
 */

import { ApiProperty } from "@nestjs/swagger";
import { InteractedReelItemDto } from "./interacted-reel-item.dto";

/**
 * Pagination metadata for the saved reels list.
 */
export class SavedReelsMetaDto {
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
        description: "Whether more saved reels are available beyond this page.",
    })
    has_more!: boolean;
}

/**
 * Paginated response for GET /reels/saved.
 */
export class SavedReelsPaginatedResponseDto {
    @ApiProperty({
        type: [InteractedReelItemDto],
        description:
            "Reels saved by the authenticated user, most recently saved first.",
    })
    data!: InteractedReelItemDto[];

    @ApiProperty({
        type: () => SavedReelsMetaDto,
        description: "Pagination metadata.",
    })
    meta!: SavedReelsMetaDto;
}
