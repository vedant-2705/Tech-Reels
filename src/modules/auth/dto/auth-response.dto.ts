/**
 * @module modules/auth/dto/auth-response.dto
 * @description
 * Response DTOs returned by authentication endpoints after successful
 * registration, login, or OAuth authentication.
 */

import { ApiProperty } from "@nestjs/swagger";
import { EXPERIENCE_LEVELS, USER_ROLES } from "../entities/user.entity";

/**
 * Public user snapshot included in authentication responses.
 */
export class AuthUserDto {
    @ApiProperty({ example: "019501a0-0000-7000-8000-000000000001" })
    id!: string;

    @ApiProperty({ example: "alice@example.com" })
    email!: string;

    @ApiProperty({ example: "alice_dev" })
    username!: string;

    @ApiProperty({
        example: "https://cdn.techreel.io/avatars/alice.jpg",
        nullable: true,
    })
    avatar_url!: string | null;

    @ApiProperty({ example: "user", enum: USER_ROLES })
    role!: string;

    @ApiProperty({
        example: "novice",
        enum: EXPERIENCE_LEVELS,
    })
    experience_level!: string;

    @ApiProperty({
        example: 0,
        description: "Total XP earned. Always 0 for new users.",
    })
    total_xp!: number;

    @ApiProperty({
        example: 0,
        description: "Token balance. Always 0 for new users.",
    })
    token_balance!: number;

    @ApiProperty({
        example: 0,
        description: "Current streak in days. Always 0 for new users.",
    })
    current_streak!: number;

    @ApiProperty({ example: "2026-03-16T10:00:00.000Z" })
    created_at!: string;
}

/**
 * Authentication response envelope containing user data and issued tokens.
 */
export class AuthResponseDto {
    @ApiProperty({ type: () => AuthUserDto })
    user!: AuthUserDto;

    @ApiProperty({
        example: "eyJhbGciOiJSUzI1NiJ9...",
        description:
            "RS256 signed JWT access token. Valid for 15 minutes (900 seconds).",
    })
    access_token!: string;

    @ApiProperty({
        example: "eyJhbGciOiJIUzI1NiJ9...",
        description:
            "HS256 signed refresh token. Valid for 30 days. Single-use - rotated on each refresh.",
    })
    refresh_token!: string;

    @ApiProperty({
        example: "019501a0-0000-7000-8000-000000000002",
        description:
            "Token family UUID. Stays constant for the lifetime of a session. Use with refresh and logout.",
    })
    token_family!: string;

    @ApiProperty({
        example: 900,
        description: "Access token TTL in seconds. Always 900.",
    })
    expires_in!: number;

    @ApiProperty({
        example: false,
        description:
            "Always false for email registration. True for new OAuth users who have not yet selected topics.",
    })
    needs_onboarding!: boolean;
}
