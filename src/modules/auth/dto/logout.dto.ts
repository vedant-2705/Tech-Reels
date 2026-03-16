/**
 * @module modules/auth/dto/logout.dto
 * @description
 * Request DTO for revoking a single authenticated session by token family.
 */

import { IsUUID } from "class-validator";

/**
 * Validates the token-family identifier used for single-session logout.
 */
export class LogoutDto {
    @IsUUID("7")
    token_family!: string;
}
