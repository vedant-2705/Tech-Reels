import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Single path item in the enrolled paths list.
 * Joins user_skill_paths with skill_paths for all necessary fields.
 */
export class EnrolledPathItemDto {
    @ApiProperty({ description: "Skill path UUID" })
    path_id!: string;

    @ApiProperty()
    title!: string;

    @ApiProperty({ description: "beginner | intermediate | advanced" })
    difficulty!: string;

    @ApiPropertyOptional({ description: "Cover image URL", nullable: true })
    thumbnail_url!: string | null;

    @ApiProperty({ description: "in_progress | completed" })
    status!: string;

    @ApiProperty({ description: "Number of reels completed" })
    progress_count!: number;

    @ApiProperty({ description: "Total reels in the path" })
    total_reels!: number;

    @ApiProperty({ description: "ISO 8601 enrolment timestamp" })
    enrolled_at!: string;

    @ApiPropertyOptional({
        description: "ISO 8601 completion timestamp",
        nullable: true,
    })
    completed_at!: string | null;
}

/**
 * Response body for GET /skill-paths/me/enrolled.
 * Returns all paths the authenticated user is enrolled in or has completed,
 * ordered by enrolled_at DESC (most recently enrolled first).
 *
 * No pagination - a user's enrolments are expected to be a manageable list
 * (capped implicitly by the 20/hr enrol rate limit over time).
 */
export class EnrolledPathsResponseDto {
    @ApiProperty({ type: [EnrolledPathItemDto] })
    data!: EnrolledPathItemDto[];
}
