/**
 * @module modules/users/dto/profile-response.dto
 * @description
 * Response DTO returned by GET /users/me. Includes private fields
 * (email, account_status, public_profile_token) and OAuth metadata
 * (has_password, linked_providers) that are only visible to the
 * authenticated account owner.
 */

import { ApiProperty } from "@nestjs/swagger";
import {
    ACCOUNT_STATUSES,
    EXPERIENCE_LEVELS,
    USER_ROLES,
} from "@modules/auth/entities/user.entity";

/**
 * Full authenticated user profile response envelope.
 */
export class ProfileResponseDto {
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
        example: "Full-stack engineer passionate about distributed systems.",
        nullable: true,
    })
    bio!: string | null;

    @ApiProperty({ example: "user", enum: USER_ROLES })
    role!: string;

    @ApiProperty({ example: "intermediate", enum: EXPERIENCE_LEVELS })
    experience_level!: string;

    @ApiProperty({ example: "active", enum: ACCOUNT_STATUSES })
    account_status!: string;

    @ApiProperty({ example: 1500 })
    total_xp!: number;

    @ApiProperty({ example: 100 })
    token_balance!: number;

    @ApiProperty({ example: 7 })
    current_streak!: number;

    @ApiProperty({ example: 14 })
    longest_streak!: number;

    @ApiProperty({
        example: "2026-03-16",
        nullable: true,
        description: "Last active date in YYYY-MM-DD format.",
    })
    last_active_date!: string | null;

    @ApiProperty({
        example: "a1b2c3d4e5f6...",
        nullable: true,
        description:
            "64-char hex token for recruiter-facing public profile. Null if not generated.",
    })
    public_profile_token!: string | null;

    @ApiProperty({
        example: true,
        description: "False for pure OAuth users who have no password set.",
    })
    has_password!: boolean;

    @ApiProperty({
        example: ["google"],
        description: "OAuth providers linked to this account.",
        type: [String],
    })
    linked_providers!: string[];

    @ApiProperty({ example: "2026-01-01T00:00:00.000Z" })
    created_at!: string;
}
