/**
 * @module modules/users/dto/update-profile.dto
 * @description
 * Request DTO for PATCH /users/me. All fields are optional - send only
 * what should change. Sending bio: null explicitly clears the field;
 * omitting bio leaves it unchanged.
 */

import {
    IsEnum,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    MinLength,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import {
    EXPERIENCE_LEVELS,
    type ExperienceLevel,
} from "@modules/auth/entities/user.entity";

/**
 * Validates the optional profile update payload.
 */
export class UpdateProfileDto {
    @ApiProperty({
        example: "alice_dev",
        description:
            "New username. Min 3, max 50 chars. Letters, numbers, and underscores only.",
        required: false,
        minLength: 3,
        maxLength: 50,
    })
    @IsOptional()
    @IsString()
    @MinLength(3)
    @MaxLength(50)
    @Matches(/^[a-zA-Z0-9_]+$/, {
        message: "username may only contain letters, numbers, and underscores",
    })
    username?: string;

    @ApiProperty({
        example: "Full-stack engineer passionate about distributed systems.",
        description:
            "Profile bio. Max 300 chars. Send null to explicitly clear the bio field. " +
            "Omit the field entirely to leave it unchanged.",
        required: false,
        nullable: true,
        maxLength: 300,
    })
    @IsOptional()
    @IsString()
    @MaxLength(300)
    bio?: string | null;

    @ApiProperty({
        example: "intermediate",
        description: "User's self-assessed experience level.",
        required: false,
        enum: EXPERIENCE_LEVELS,
    })
    @IsOptional()
    @IsEnum(EXPERIENCE_LEVELS)
    experience_level?: ExperienceLevel;
}
