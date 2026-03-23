/**
 * @module modules/reels/dto/reel-response.dto
 * @description
 * Standard reel response shape returned by most read and write endpoints.
 * Feed-specific response (with is_liked / is_saved) extends this class.
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Embedded creator snapshot within a reel response.
 */
export class ReelCreatorDto {
    @ApiProperty({
        example: "019501a0-0000-7000-8000-000000000001",
        description: "Creator user UUID.",
    })
    id!: string;

    @ApiProperty({
        example: "alice_dev",
        description: "Creator username.",
    })
    username!: string;

    @ApiPropertyOptional({
        example: "https://cdn.techreel.io/avatars/alice.jpg",
        description: "Creator avatar URL. Null if not set.",
        nullable: true,
    })
    avatar_url!: string | null;
}

/**
 * Embedded tag within a reel response.
 */
export class ReelTagDto {
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
        description: "Tag category (e.g. frontend, backend, devops).",
    })
    category!: string;
}

/**
 * Full reel representation returned by public and authenticated endpoints.
 */
export class ReelResponseDto {
    @ApiProperty({
        example: "019501a0-0000-7000-8000-000000000001",
        description: "Reel UUID v7.",
    })
    id!: string;

    @ApiProperty({
        example: "How to use React hooks",
        description: "Reel title.",
    })
    title!: string;

    @ApiPropertyOptional({
        example: "A deep dive into useState and useEffect.",
        description: "Reel description. Null if not provided.",
        nullable: true,
    })
    description!: string | null;

    @ApiPropertyOptional({
        example: "reels/019501a0-0000-7000-8000-000000000001/master.m3u8",
        description: "HLS playlist path. Null until processing completes.",
        nullable: true,
    })
    hls_path!: string | null;

    @ApiPropertyOptional({
        example: "reels/019501a0-0000-7000-8000-000000000001/thumbnail.jpg",
        description: "Thumbnail S3 key. Null until processing completes.",
        nullable: true,
    })
    thumbnail_key!: string | null;

    @ApiPropertyOptional({
        example: 62,
        description:
            "Reel duration in seconds. Null until processing completes.",
        nullable: true,
    })
    duration_seconds!: number | null;

    @ApiProperty({
        example: "active",
        description:
            "Reel lifecycle status (uploading, processing, active, failed, needs_review, disabled, deleted).",
    })
    status!: string;

    @ApiProperty({
        example: "intermediate",
        description:
            "Target audience difficulty level (beginner, intermediate, advanced).",
    })
    difficulty!: string;

    @ApiProperty({ example: 1024, description: "Total number of views." })
    view_count!: number;

    @ApiProperty({ example: 87, description: "Total number of likes." })
    like_count!: number;

    @ApiProperty({ example: 34, description: "Total number of saves." })
    save_count!: number;

    @ApiProperty({ example: 12, description: "Total number of shares." })
    share_count!: number;

    @ApiProperty({
        type: () => ReelCreatorDto,
        description: "Creator user snapshot.",
    })
    creator!: ReelCreatorDto;

    @ApiProperty({
        type: [ReelTagDto],
        description: "Tags associated with this reel.",
    })
    tags!: ReelTagDto[];

    @ApiProperty({
        example: "2026-03-16T10:00:00.000Z",
        description: "ISO 8601 creation timestamp.",
    })
    created_at!: string;

    @ApiProperty({
        example: "2026-03-16T11:00:00.000Z",
        description: "ISO 8601 last-updated timestamp.",
    })
    updated_at!: string;
}
