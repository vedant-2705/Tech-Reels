/**
 * @module modules/users/dto/public-profile-response.dto
 * @description
 * Response DTO for public profile endpoints. Used by both
 * GET /users/:username (standard public view) and
 * GET /users/public/:token (recruiter-facing enriched view).
 * Private fields (email, account_status, token_balance) are never
 * included.
 */

import { ApiProperty } from "@nestjs/swagger";
import { EXPERIENCE_LEVELS } from "@modules/auth/entities/user.entity";

/**
 * Badge summary shape included in public profile responses.
 */
export class PublicBadgeDto {
    @ApiProperty({ example: "streak_7" })
    code!: string;

    @ApiProperty({ example: "7-Day Streak" })
    name!: string;

    @ApiProperty({
        example: "Watched reels 7 days in a row.",
        description: "Only included in recruiter-facing (token) profile view.",
        required: false,
    })
    description?: string;

    @ApiProperty({ example: "https://cdn.techreel.io/badges/streak_7.png" })
    icon_url!: string;

    @ApiProperty({
        example: "2026-02-01T00:00:00.000Z",
        description: "Only included in recruiter-facing (token) profile view.",
        required: false,
    })
    earned_at?: string;
}

/**
 * Top topic shape included in recruiter-facing profile responses.
 */
export class TopTopicDto {
    @ApiProperty({ example: "TypeScript" })
    tag_name!: string;

    @ApiProperty({ example: 4.75 })
    score!: number;
}

/**
 * Public profile response envelope.
 * Fields marked optional are only present in the recruiter-facing
 * (token-based) view.
 */
export class PublicProfileResponseDto {
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

    @ApiProperty({ example: "intermediate", enum: EXPERIENCE_LEVELS })
    experience_level!: string;

    @ApiProperty({ example: 1500 })
    total_xp!: number;

    @ApiProperty({ example: 7 })
    current_streak!: number;

    @ApiProperty({ example: 14 })
    longest_streak!: number;

    @ApiProperty({ type: () => [PublicBadgeDto] })
    badges!: PublicBadgeDto[];

    @ApiProperty({ example: 42 })
    reels_count!: number;

    @ApiProperty({ example: "2026-01-01T00:00:00.000Z" })
    joined_at!: string;

    // --- Recruiter-facing (token) only fields below ---

    @ApiProperty({
        example: 0.87,
        description:
            "Challenge accuracy rate (0.0–1.0). Only present in token-based profile view.",
        required: false,
    })
    accuracy_rate?: number;

    @ApiProperty({
        type: () => [TopTopicDto],
        description:
            "Top 5 topic affinities. Only present in token-based profile view.",
        required: false,
    })
    top_topics?: TopTopicDto[];

    @ApiProperty({
        example: 12,
        description:
            "Paths completed. Only present in token-based profile view.",
        required: false,
    })
    paths_completed?: number;

    @ApiProperty({
        example: 78,
        description:
            "Total challenges answered correctly. Only present in token-based profile view.",
        required: false,
    })
    challenges_correct?: number;

    @ApiProperty({
        example: 90,
        description:
            "Total challenges attempted. Only present in token-based profile view.",
        required: false,
    })
    challenges_attempted?: number;

    @ApiProperty({
        example: 250,
        description: "Reels watched. Only present in token-based profile view.",
        required: false,
    })
    reels_watched?: number;

    @ApiProperty({
        example: 5,
        description:
            "Active reels published. Only present in token-based profile view.",
        required: false,
    })
    reels_published?: number;
}
