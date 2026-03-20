/**
 * @module modules/auth/dto/refresh-token.dto
 * @description
 * Request DTO for refreshing an authenticated session using a refresh token
 * and its token-family identifier.
 */

import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, IsUUID } from "class-validator";

/**
 * Validates refresh-session payload submitted to the refresh endpoint.
 */
export class RefreshTokenDto {
    @ApiProperty({
        example: 'eyJhbGciOiJIUzI1NiJ9...',
        description:
        'The refresh token received from the last login, register, or refresh call. ' +
        'Single-use - this token is immediately invalidated after a successful refresh.',
    })
    @IsString()
    @IsNotEmpty()
    refresh_token!: string;

    @ApiProperty({
        example: '019501a0-0000-7000-8000-000000000001',
        description:
        'The token family UUID received at login. Stays the same across all rotations ' +
        'within a session. Used to detect replay attacks.',
    })
    @IsUUID("7")
    token_family!: string;
}
