/**
 * @module modules/auth/dto/oauth.dto
 * @description
 * Request DTO carrying the provider authorization code for OAuth login.
 */

import { IsNotEmpty, IsString } from "class-validator";

/**
 * Validates the OAuth authorization code submitted by the client.
 */
export class OAuthDto {
    @IsString()
    @IsNotEmpty()
    code!: string;
}
