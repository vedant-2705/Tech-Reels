/**
 * @module modules/users/dto/stats-response.dto
 * @description
 * Response DTO for GET /users/me/stats. Returns gamification and
 * activity statistics for the authenticated user.
 */

import { ApiProperty } from "@nestjs/swagger";

/**
 * Gamification and activity stats response envelope.
 */
export class StatsResponseDto {
    @ApiProperty({ example: 1500 })
    total_xp!: number;

    @ApiProperty({ example: 100 })
    token_balance!: number;

    @ApiProperty({ example: 7 })
    current_streak!: number;

    @ApiProperty({ example: 14 })
    longest_streak!: number;

    @ApiProperty({ example: 5 })
    badges_earned!: number;

    @ApiProperty({ example: 250 })
    reels_watched!: number;

    @ApiProperty({ example: 90 })
    challenges_attempted!: number;

    @ApiProperty({ example: 78 })
    challenges_correct!: number;

    @ApiProperty({
        example: 0.87,
        description:
            "Challenge accuracy rate from 0.0 to 1.0. 0.0 when no attempts yet.",
    })
    accuracy_rate!: number;

    @ApiProperty({ example: 3 })
    paths_completed!: number;

    @ApiProperty({
        example: 42,
        nullable: true,
        description:
            "Weekly leaderboard rank. Null if not ranked in any leaderboard.",
    })
    leaderboard_rank!: number | null;
}
