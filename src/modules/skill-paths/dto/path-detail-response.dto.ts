import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Tag name for display within a path reel item.
 * Only the name is surfaced - category and ID are not needed at this level.
 */
export class PathReelTagDto {
    @ApiProperty()
    name!: string;
}

/**
 * Single reel within the skill path detail view.
 *
 * thumbnail_url: the service converts the raw thumbnail_key from the DB
 * using CDN_BASE_URL before building this DTO. The repository returns the
 * raw key; the DTO always holds the final URL.
 *
 * is_completed: true if the requesting user has a row in
 * user_skill_path_progress for (userId, pathId, reelId) with >= 80%
 * completion. Merged by the service from getUserProgress() result.
 */
export class PathReelItemDto {
    @ApiProperty({ description: "Position in the path (1-indexed)" })
    order!: number;

    @ApiProperty({ description: "Reel UUID" })
    id!: string;

    @ApiProperty()
    title!: string;

    @ApiProperty({ description: "beginner | intermediate | advanced" })
    difficulty!: string;

    @ApiPropertyOptional({ description: "CDN thumbnail URL", nullable: true })
    thumbnail_url!: string | null;

    @ApiProperty({ description: "Video duration in seconds" })
    duration!: number;

    @ApiProperty({
        description:
            "Whether the requesting user has completed this reel in the path",
    })
    is_completed!: boolean;

    @ApiProperty({ type: [PathReelTagDto] })
    tags!: PathReelTagDto[];
}

/**
 * Full skill path detail with ordered reel list and user enrolment status.
 * Returned by GET /skill-paths/:id.
 */
export class PathDetailResponseDto {
    @ApiProperty()
    id!: string;

    @ApiProperty()
    title!: string;

    @ApiProperty()
    description!: string;

    @ApiProperty({ description: "beginner | intermediate | advanced" })
    difficulty!: string;

    @ApiPropertyOptional({ description: "Cover image URL", nullable: true })
    thumbnail_url!: string | null;

    @ApiProperty()
    total_reels!: number;

    @ApiProperty()
    estimated_duration_minutes!: number;

    @ApiProperty({ description: "Whether the requesting user is enrolled" })
    is_enrolled!: boolean;

    @ApiProperty({
        description:
            "Number of reels completed by the user (0 if not enrolled)",
    })
    progress_count!: number;

    @ApiPropertyOptional({
        description: "in_progress | completed | null",
        nullable: true,
    })
    status!: string | null;

    @ApiProperty({ type: [PathReelItemDto] })
    reels!: PathReelItemDto[];
}
