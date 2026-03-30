import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Response shape for admin write operations on skill paths.
 *
 * Used by both:
 *   POST /skill-paths   -> populates created_at (updated_at is undefined)
 *   PATCH /skill-paths/:id -> populates updated_at (created_at is undefined)
 *
 * Only the relevant timestamp field is populated per operation.
 * Both are optional in the type but one is always present in practice.
 */
export class PathResponseDto {
    @ApiProperty({ description: "Skill path UUID" })
    id!: string;

    @ApiProperty({ description: "Path title" })
    title!: string;

    @ApiProperty({ description: "Total number of reels in the path" })
    total_reels!: number;

    @ApiProperty({ description: "Estimated total watch time in minutes" })
    estimated_duration_minutes!: number;

    @ApiProperty({ description: "Whether the path is visible to users" })
    is_published!: boolean;

    /**
     * Populated by POST /skill-paths (create).
     * Not present on PATCH responses.
     */
    @ApiPropertyOptional({
        description: "ISO 8601 creation timestamp (create response only)",
    })
    created_at?: string;

    /**
     * Populated by PATCH /skill-paths/:id (update).
     * Not present on POST responses.
     */
    @ApiPropertyOptional({
        description: "ISO 8601 last-updated timestamp (update response only)",
    })
    updated_at?: string;
}
