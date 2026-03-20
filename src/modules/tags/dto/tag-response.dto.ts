/**
 * @module modules/tags/dto/tag-response.dto
 * @description
 * Response DTO for all Tags endpoints. A single class covers all four
 * response shapes - list items, single-tag lookup, create, and update -
 * by marking fields that are only present in certain responses as optional.
 *
 * Field presence by endpoint:
 *   GET  /tags        -> id, name, category, reel_count
 *   GET  /tags/:id    -> id, name, category, reel_count, created_at
 *   POST /tags        -> id, name, category, created_at
 *   PATCH /tags/:id   -> id, name, category, updated_at
 */

import { ApiProperty } from "@nestjs/swagger";

/**
 * Public tag representation returned by all Tags endpoints.
 */
export class TagResponseDto {
    @ApiProperty({ example: "019501a0-1234-7abc-8def-000000000001" })
    id!: string;

    @ApiProperty({ example: "react" })
    name!: string;

    @ApiProperty({ example: "frontend" })
    category!: string;

    /**
     * Count of active (non-deleted, status=active) reels tagged with this tag.
     * Present on GET /tags and GET /tags/:id.
     * Returns 0 until the Reels module is built - this is correct behaviour.
     */
    @ApiProperty({
        example: 42,
        required: false,
        description:
            "Count of active reels with this tag. " +
            "Only present on GET /tags and GET /tags/:id responses.",
    })
    reel_count?: number;

    /**
     * ISO 8601 creation timestamp.
     * Present on GET /tags/:id and POST /tags responses.
     */
    @ApiProperty({
        example: "2025-01-15T10:30:00.000Z",
        required: false,
        description:
            "Tag creation timestamp (ISO 8601). " +
            "Present on GET /tags/:id and POST /tags responses.",
    })
    created_at?: string;

    /**
     * ISO 8601 last-updated timestamp.
     * Present on PATCH /tags/:id responses only.
     */
    @ApiProperty({
        example: "2025-06-01T14:20:00.000Z",
        required: false,
        description:
            "Tag last-updated timestamp (ISO 8601). " +
            "Present on PATCH /tags/:id responses only.",
    })
    updated_at?: string;
}

/**
 * Paginated list response wrapper for GET /tags.
 */
export class TagListResponseDto {
    @ApiProperty({ type: [TagResponseDto] })
    data!: TagResponseDto[];

    @ApiProperty({ example: { total: 24 } })
    meta!: { total: number };
}
