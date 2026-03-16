/**
 * @module modules/auth/dto/register.dto
 * @description
 * Request DTO for credential-based account registration.
 */

import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsEmail,
    IsEnum,
    IsString,
    Matches,
    MaxLength,
    MinLength,
} from "class-validator";
import { Transform } from "class-transformer";
import { IsUUID } from "class-validator";
import { EXPERIENCE_LEVELS, type ExperienceLevel } from "../entities/user.entity";
import { ApiProperty } from "@nestjs/swagger";

/**
 * Validates registration payload fields including credentials,
 * topic selections, and declared experience level.
 */
export class RegisterDto {
    @ApiProperty({
        example: "john.doe@example.com",
        description: "Valid email address. Transformed to lowercase + trimmed.",
        maxLength: 255,
    })
    @IsEmail()
    @MaxLength(255)
    @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
    email!: string;

    @ApiProperty({
        example: "P@ssw0rd!",
        description:
            "Password with 8-128 chars, including one uppercase, one lowercase, one number, and one special character.",
        minLength: 8,
        maxLength: 128,
    })
    @IsString()
    @MinLength(8)
    @MaxLength(128)
    // Must contain: 1 uppercase, 1 lowercase, 1 number, 1 special character
    @Matches(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*])/, {
        message:
            "password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (!@#$%^&*)",
    })
    password!: string;

    @ApiProperty({
        example: "john_doe",
        description:
            "Username with 3-50 chars, letters/numbers/underscores only, no spaces.",
        minLength: 3,
        maxLength: 50,
    })
    @IsString()
    @MinLength(3)
    @MaxLength(50)
    // Letters, numbers, underscores only - no spaces
    @Matches(/^[a-zA-Z0-9_]+$/, {
        message: "username may only contain letters, numbers, and underscores",
    })
    username!: string;

    @ApiProperty({
        example: ['019501a0-0000-7000-8000-000000000001'],
        description:
            'Array of tag UUIDs (v7) representing the user\'s topic interests. Min 1, max 10. Each must be a valid existing tag ID.',
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
        example: 'novice',
        description: 'The user\'s self-assessed experience level.',
        enum: EXPERIENCE_LEVELS,
    })
    @IsEnum(EXPERIENCE_LEVELS)
    experience_level!: ExperienceLevel;
}
