import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * The next reel the user should watch to continue progress.
 * null when the path is completed.
 */
export class NextReelDto {
    @ApiProperty({ description: "Position in the path (1-indexed)" })
    order!: number;

    @ApiProperty({ description: "Reel UUID" })
    id!: string;

    @ApiProperty()
    title!: string;
}

/**
 * Detailed progress state for an enrolled user on a specific path.
 * Returned by GET /skill-paths/:id/progress.
 *
 * Throws NotEnrolledException (404) if the user is not enrolled.
 * Throws PathNotFoundException (404) if the path does not exist or is unpublished.
 */
export class PathProgressResponseDto {
    @ApiProperty({ description: "Skill path UUID" })
    path_id!: string;

    @ApiProperty({ description: "in_progress | completed" })
    status!: string;

    @ApiProperty({ description: "Number of reels completed in this path" })
    progress_count!: number;

    @ApiProperty({ description: "Total reels in the path" })
    total_reels!: number;

    @ApiProperty({ description: "Completion percentage 0-100 (Math.round)" })
    percentage!: number;

    @ApiProperty({ description: "ISO 8601 enrolment timestamp" })
    enrolled_at!: string;

    @ApiPropertyOptional({
        description: "ISO 8601 completion timestamp",
        nullable: true,
    })
    completed_at!: string | null;

    @ApiPropertyOptional({
        description: "Certificate URL - present only after first completion",
        nullable: true,
    })
    certificate_url!: string | null;

    @ApiPropertyOptional({
        description: "Next reel to watch. null when path is completed.",
        nullable: true,
        type: NextReelDto,
    })
    next_reel!: NextReelDto | null;
}
