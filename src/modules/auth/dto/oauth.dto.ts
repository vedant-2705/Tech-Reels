/**
 * @module modules/auth/dto/oauth.dto
 * @description
 * Request DTO carrying the provider authorization code for OAuth login.
 */

import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

/**
 * Validates the OAuth authorization code submitted by the client.
 */
export class OAuthDto {
    @ApiProperty({
        example: '4/0AX4XfWh...',
        description:
        'One-time OAuth authorization code received from the provider redirect. ' +
        'Single-use, expires in ~60 seconds. Must be exchanged immediately.',
    })
    @IsString()
    @IsNotEmpty()
    code!: string;
}
