/**
 * @module modules/admin/dto/admin-user-detail.dto
 * @description
 * Response shape for GET /admin/users/:id - full user profile visible to admins.
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Full user detail response for the admin user profile endpoint.
 */
export class AdminUserDetailDto {
    @ApiProperty({
        example: "019501a0-0000-7000-8000-000000000001",
        description: "User UUID v7.",
    })
    id!: string;

    @ApiProperty({
        example: "alice@example.com",
        description: "User email address.",
    })
    email!: string;

    @ApiProperty({
        example: "alice_dev",
        description: "Unique username.",
    })
    username!: string;

    @ApiPropertyOptional({
        example: "https://cdn.techreel.io/avatars/alice.jpg",
        description: "Avatar URL. Null if not set.",
        nullable: true,
    })
    avatar_url!: string | null;

    @ApiPropertyOptional({
        example: "Senior frontend engineer.",
        description: "User bio. Null if not set.",
        nullable: true,
    })
    bio!: string | null;

    @ApiProperty({
        example: "user",
        description: 'User role. Either "user" or "admin".',
    })
    role!: string;

    @ApiProperty({
        example: "active",
        description: "Account status (active, suspended, banned, deactivated).",
    })
    account_status!: string;

    @ApiProperty({
        example: "intermediate",
        description: "Experience level (novice, intermediate, advanced).",
    })
    experience_level!: string;

    @ApiProperty({
        example: 1240,
        description: "Total XP earned.",
    })
    total_xp!: number;

    @ApiProperty({
        example: 50,
        description: "Current token balance.",
    })
    token_balance!: number;

    @ApiProperty({
        example: 7,
        description: "Current daily streak in days.",
    })
    current_streak!: number;

    @ApiProperty({
        example: 14,
        description: "Longest streak ever achieved.",
    })
    longest_streak!: number;

    @ApiProperty({
        example: "2026-03-01T10:00:00.000Z",
        description: "ISO 8601 account creation timestamp.",
    })
    created_at!: string;

    @ApiPropertyOptional({
        example: "2026-03-31",
        description: "Date the user was last active. Null if never active.",
        nullable: true,
    })
    last_active_date!: string | null;

    @ApiProperty({
        example: ["google"],
        description: "OAuth providers linked to this account.",
        type: [String],
    })
    linked_providers!: string[];

    @ApiProperty({
        example: 3,
        description: "Total number of badges earned.",
    })
    badges_earned!: number;

    @ApiProperty({
        example: 12,
        description: "Total number of reels published (non-deleted).",
    })
    reels_published!: number;

    @ApiProperty({
        example: 4,
        description: "Total number of reports submitted by this user.",
    })
    reports_submitted!: number;

    @ApiProperty({
        example: 1,
        description: "Total number of reports received on this user's reels.",
    })
    reports_received!: number;
}
