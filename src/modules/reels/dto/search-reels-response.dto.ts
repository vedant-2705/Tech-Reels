/**
 * @module modules/reels/dto/search-reels-response.dto
 * @description
 * Response DTO for GET /reels/search.
 * Extends the feed item shape with matched tag metadata.
 */

import { ApiProperty } from "@nestjs/swagger";
import { FeedItemDto } from "./feed-response.dto";

/**
 * Tag metadata returned alongside search results.
 * Tells the client which tags were matched by the query.
 */
export class MatchedTagDto {
    @ApiProperty({
        example: "019501a0-0000-7000-8000-000000000010",
        description: "Tag UUID.",
    })
    id!: string;

    @ApiProperty({
        example: "React",
        description: "Tag display name.",
    })
    name!: string;

    @ApiProperty({
        example: "frontend",
        description: "Tag category.",
    })
    category!: string;
}

/**
 * Pagination metadata for the search response.
 */
export class SearchMetaDto {
    @ApiProperty({
        example: 10,
        description:
            "Integer offset cursor for the next page. Null when no more results.",
        nullable: true,
    })
    next_cursor!: number | null;

    @ApiProperty({
        example: true,
        description: "Whether more results are available beyond this page.",
    })
    has_more!: boolean;
}

/**
 * Full response shape for GET /reels/search.
 */
export class SearchReelsResponseDto {
    @ApiProperty({
        type: [FeedItemDto],
        description:
            "Ordered list of search results sorted by view_count DESC.",
    })
    data!: FeedItemDto[];

    @ApiProperty({
        type: () => SearchMetaDto,
        description: "Pagination metadata.",
    })
    meta!: SearchMetaDto;

    @ApiProperty({
        type: [MatchedTagDto],
        description:
            "Tags matched by the search query. Empty array when no tags matched " +
            "and popular reels fallback was used.",
    })
    matched_tags!: MatchedTagDto[];
}
