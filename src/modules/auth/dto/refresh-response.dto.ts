/**
 * @module modules/auth/dto/refresh-response.dto
 * @description
 * Response DTO returned after a successful refresh-token rotation.
 */

import { ApiProperty } from "@nestjs/swagger";

/**
 * Token rotation response containing the new access/refresh token pair.
 */
export class RefreshResponseDto {
    @ApiProperty({
        example: "eyJhbGciOiJSUzI1NiJ9...",
        description:
            "New RS256 access token. Previous access token is still valid until its own expiry.",
    })
    access_token!: string;

    @ApiProperty({
        example: "eyJhbGciOiJIUzI1NiJ9...",
        description:
            "New refresh token. The previous refresh token is immediately invalidated — store this one.",
    })
    refresh_token!: string;

    @ApiProperty({
        example: "019501a0-0000-7000-8000-000000000002",
        description:
            "Same token family UUID as before — family never changes within a session.",
    })
    token_family!: string;

    @ApiProperty({
        example: 900,
        description: "Access token TTL in seconds. Always 900.",
    })
    expires_in!: number;
}
