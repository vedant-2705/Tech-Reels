/**
 * @module modules/users/dto/complete-onboarding.dto
 * @description
 * Request DTO for POST /users/me/onboarding. Sets the topic interests
 * and experience level for new OAuth users completing onboarding.
 */

import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsEnum,
    IsUUID,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import {
    EXPERIENCE_LEVELS,
    type ExperienceLevel,
} from "@modules/auth/entities/user.entity";

/**
 * Validates the onboarding completion payload.
 */
export class CompleteOnboardingDto {
    @ApiProperty({
        example: ["019501a0-0000-7000-8000-000000000001"],
        description:
            "Array of tag UUIDs (v7) representing the user's topic interests. " +
            "Min 1, max 10. Each must be a valid existing tag ID.",
        type: [String],
        minItems: 1,
        maxItems: 10,
    })
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(10)
    @IsUUID("7", { each: true })
    topics!: string[];

    @ApiProperty({
        example: "novice",
        description: "User's self-assessed experience level.",
        enum: EXPERIENCE_LEVELS,
    })
    @IsEnum(EXPERIENCE_LEVELS)
    experience_level!: ExperienceLevel;
}
