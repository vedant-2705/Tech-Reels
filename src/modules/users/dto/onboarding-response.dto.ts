/**
 * @module modules/users/dto/onboarding-response.dto
 * @description
 * Response DTO returned by POST /users/me/onboarding after successful
 * onboarding completion.
 */

import { ApiProperty } from "@nestjs/swagger";
import { EXPERIENCE_LEVELS } from "@modules/auth/entities/user.entity";

/**
 * Onboarding completion response envelope.
 */
export class OnboardingResponseDto {
    @ApiProperty({ example: "Onboarding complete" })
    message!: string;

    @ApiProperty({ example: "novice", enum: EXPERIENCE_LEVELS })
    experience_level!: string;

    @ApiProperty({
        example: 3,
        description: "Number of topic interests successfully seeded.",
    })
    topics_count!: number;
}
