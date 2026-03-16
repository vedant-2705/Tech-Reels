/**
 * @module modules/auth/dto/me-response.dto
 * @description
 * Response DTO returned by the authenticated profile endpoint.
 */

import { ApiProperty } from "@nestjs/swagger";

/**
 * Detailed authenticated user profile payload for `GET /auth/me`.
 */
export class MeResponseDto {
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

    @ApiProperty({
        example: "Software engineer building cool things.",
        nullable: true,
    })
    bio!: string | null;

    @ApiProperty({ example: "user", enum: ["user", "admin"] })
    role!: string;

    @ApiProperty({
        example: "novice",
        enum: ["novice", "intermediate", "advanced"],
    })
    experience_level!: string;

    @ApiProperty({
        example: "active",
        enum: ["active", "suspended", "banned", "deactivated"],
    })
    account_status!: string;

    @ApiProperty({ example: 450 })
    total_xp!: number;

    @ApiProperty({ example: 10 })
    token_balance!: number;

    @ApiProperty({ example: 7, description: "Consecutive days active." })
    current_streak!: number;

    @ApiProperty({
        example: 14,
        description: "All-time longest streak in days.",
    })
    longest_streak!: number;

    @ApiProperty({
        example: "2026-03-15",
        nullable: true,
        description: "Date of last activity. Format: YYYY-MM-DD.",
    })
    last_active_date!: string | null;

    @ApiProperty({
        example: "a3f9b2c1d4e5",
        nullable: true,
        description:
            "Token used for public profile links. Null if profile is not public.",
    })
    public_profile_token!: string | null;

    @ApiProperty({ example: "2026-03-16T10:00:00.000Z" })
    created_at!: string;
}
