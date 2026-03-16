/**
 * @module modules/auth/dto/refresh-token.dto
 * @description
 * Request DTO for refreshing an authenticated session using a refresh token
 * and its token-family identifier.
 */

import { IsNotEmpty, IsString, IsUUID } from "class-validator";

/**
 * Validates refresh-session payload submitted to the refresh endpoint.
 */
export class RefreshTokenDto {
    @IsString()
    @IsNotEmpty()
    refresh_token!: string;

    @IsUUID("7")
    token_family!: string;
}
