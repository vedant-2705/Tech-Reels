import { ApiProperty } from "@nestjs/swagger";

/**
 * Response body for POST /skill-paths/:id/enrol.
 * Returned on both first-time enrolment and re-enrolment after completion.
 */
export class EnrolResponseDto {
    @ApiProperty({ example: "Enrolled successfully" })
    message!: string;

    @ApiProperty({ description: "UUID of the path enrolled in" })
    path_id!: string;

    @ApiProperty({ description: "ISO 8601 enrolment timestamp" })
    enrolled_at!: string;
}
