/**
 * @module modules/users/dto/deactivate.dto
 * @description
 * Request DTO for POST /users/me/deactivate. The password field is
 * required for password-based accounts and not required for pure OAuth
 * users (whose password_hash is null). Validation of whether the
 * password is needed is handled in the service layer.
 */

import { IsOptional, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * Validates the account deactivation payload.
 */
export class DeactivateDto {
    @ApiProperty({
        example: "P@ssw0rd!",
        description:
            "Current password. Required for password-based accounts. " +
            "Omit for pure OAuth accounts (those without a password).",
        required: false,
    })
    @IsOptional()
    @IsString()
    password?: string;
}
