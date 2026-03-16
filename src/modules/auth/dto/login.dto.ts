/**
 * @module modules/auth/dto/login.dto
 * @description
 * Request DTO for email/password authentication.
 */

import { IsEmail, IsNotEmpty, IsString, MaxLength } from "class-validator";
import { Transform } from "class-transformer";

/**
 * Validates login credentials submitted to the authentication API.
 */
export class LoginDto {
    @IsEmail()
    @MaxLength(255)
    @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
    email!: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(128)
    password!: string;
}
