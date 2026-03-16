/**
 * @module modules/auth/dto/login.dto
 * @description
 * Request DTO for email/password authentication.
 */

import { IsEmail, IsNotEmpty, IsString, MaxLength } from "class-validator";
import { Transform } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";

/**
 * Validates login credentials submitted to the authentication API.
 */
export class LoginDto {
    @ApiProperty({
        example: "john.doe@example.com",
        description: "Registered email address. Transformed to lowercase + trimmed.",
        maxLength: 255,
    })
    @IsEmail()
    @MaxLength(255)
    @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
    email!: string;

    @ApiProperty({
        example: 'P@ssw0rd!',
        description: 'Account password. Max 128 characters.',
        maxLength: 128,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(128)
    password!: string;
}
