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

/**
 * Validates registration payload fields including credentials,
 * topic selections, and declared experience level.
 */
export class RegisterDto {
    @IsEmail()
    @MaxLength(255)
    @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
    email!: string;

    @IsString()
    @MinLength(8)
    @MaxLength(128)
    // Must contain: 1 uppercase, 1 lowercase, 1 number, 1 special character
    @Matches(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*])/, {
        message:
            "password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (!@#$%^&*)",
    })
    password!: string;

    @IsString()
    @MinLength(3)
    @MaxLength(50)
    // Letters, numbers, underscores only - no spaces
    @Matches(/^[a-zA-Z0-9_]+$/, {
        message: "username may only contain letters, numbers, and underscores",
    })
    username!: string;

    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(10)
    @IsUUID("7", { each: true })
    topics!: string[];

    @IsEnum(EXPERIENCE_LEVELS)
    experience_level!: ExperienceLevel;
}
