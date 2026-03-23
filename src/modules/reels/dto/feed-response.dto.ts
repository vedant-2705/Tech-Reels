/**
 * @module modules/reels/dto/feed-response.dto
 * @description
 * Response DTO for GET /reels/feed. Extends ReelResponseDto with
 * per-user personalisation flags (is_liked, is_saved).
 */

import { ApiProperty } from "@nestjs/swagger";
import { ReelResponseDto } from "./reel-response.dto";

/**
 * Single item in the personalised feed response.
 */
export class FeedItemDto extends ReelResponseDto {
    @ApiProperty({
        example: false,
        description: "Whether the authenticated user has liked this reel.",
    })
    is_liked!: boolean;

    @ApiProperty({
        example: false,
        description: "Whether the authenticated user has saved this reel.",
    })
    is_saved!: boolean;
}

/**
 * Pagination metadata for the feed response.
 */
export class FeedMetaDto {
    @ApiProperty({
        example: 10,
        description:
            "Integer cursor position to use as the cursor param on the next request.",
    })
    next_cursor!: number;

    @ApiProperty({
        example: true,
        description: "Whether more feed items are available beyond this page.",
    })
    has_more!: boolean;
}

/**
 * Full response shape for GET /reels/feed.
 */
export class FeedResponseDto {
    @ApiProperty({
        type: [FeedItemDto],
        description: "Ordered list of personalised feed items for this page.",
    })
    data!: FeedItemDto[];

    @ApiProperty({
        type: () => FeedMetaDto,
        description: "Pagination metadata.",
    })
    meta!: FeedMetaDto;
}
