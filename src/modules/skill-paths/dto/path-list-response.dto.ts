import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Single item in the published path list.
 * Includes the requesting user's enrolment status merged in by the service.
 */
export class PathListItemDto {
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

    @ApiProperty({ description: "Total number of reels in the path" })
    total_reels!: number;

    @ApiProperty({ description: "Estimated watch time in minutes" })
    estimated_duration_minutes!: number;

    @ApiProperty({ description: "Whether the requesting user is enrolled" })
    is_enrolled!: boolean;

    @ApiProperty({
        description:
            "Number of reels completed by the user in this path (0 if not enrolled)",
    })
    progress_count!: number;

    @ApiPropertyOptional({
        description: "in_progress | completed | null (null when not enrolled)",
        nullable: true,
    })
    status!: string | null;
}

/**
 * Paginated response for GET /skill-paths.
 */
export class PathListResponseDto {
    @ApiProperty({ type: [PathListItemDto] })
    data!: PathListItemDto[];

    @ApiProperty()
    meta!: {
        next_cursor: string | null;
        has_more: boolean;
    };
}
