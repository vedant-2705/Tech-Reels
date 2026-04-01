/**
 * @module modules/users/dto/leaderboard-response.dto
 * @description
 * Response DTO for GET /users/me/leaderboard. Returns the top N users
 * on the weekly leaderboard for a given tag, plus the requesting user's
 * own rank and score in the meta block.
 */

import { ApiProperty } from "@nestjs/swagger";

/**
 * Single leaderboard entry row.
 */
export class LeaderboardEntryDto {
    @ApiProperty({ example: 1, description: "1-based rank position." })
    rank!: number;

    @ApiProperty({ example: "alice_dev" })
    username!: string;

    @ApiProperty({ example: 450, description: "Weekly XP score for this tag." })
    score!: number;
}

/**
 * Leaderboard response metadata - tag context and requesting user position.
 */
export class LeaderboardMetaDto {
    @ApiProperty({ example: "019501a0-0000-7000-8000-000000000001" })
    tag_id!: string;

    @ApiProperty({ example: "TypeScript" })
    tag_name!: string;

    @ApiProperty({
        example: 4,
        nullable: true,
        description: "1-based rank of the requesting user. Null if not ranked.",
    })
    user_rank!: number | null;

    @ApiProperty({
        example: 290,
        nullable: true,
        description:
            "Weekly XP score of the requesting user. Null if not ranked.",
    })
    user_score!: number | null;

    @ApiProperty({
        example: 150,
        description: "Total number of users on this leaderboard.",
    })
    total_on_board!: number;
}

/**
 * Weekly leaderboard response envelope.
 */
export class LeaderboardResponseDto {
    @ApiProperty({ type: () => [LeaderboardEntryDto] })
    data!: LeaderboardEntryDto[];

    @ApiProperty({ type: () => LeaderboardMetaDto })
    meta!: LeaderboardMetaDto;
}
