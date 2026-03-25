/**
 * @module modules/challenges/dto/challenge-response.dto
 * @description
 * Response DTO for GET /reels/:reelId/challenges.
 * Correct answers are NEVER included - stripped before returning.
 * Attempt status is merged per-challenge for the requesting user.
 */

import { ApiProperty } from "@nestjs/swagger";
import {
    CHALLENGE_DIFFICULTIES,
    CHALLENGE_TYPES,
} from "../challenges.constants";

/**
 * The authenticated user's latest attempt status for a single challenge.
 * All fields are null if the challenge has not yet been attempted.
 */
export class ChallengeAttemptStatusDto {
    @ApiProperty({
        example: true,
        nullable: true,
        description:
            "Whether the latest attempt was correct. null if not yet attempted.",
    })
    is_correct!: boolean | null;

    @ApiProperty({
        example: "2",
        nullable: true,
        description:
            "The answer submitted on the latest attempt. null if not yet attempted.",
    })
    submitted_answer!: string | null;

    @ApiProperty({
        example: "2026-03-16T10:00:00.000Z",
        nullable: true,
        description:
            "ISO 8601 timestamp of the latest attempt. null if not yet attempted.",
    })
    attempted_at!: string | null;
}

/**
 * Single challenge entry returned in the GET /reels/:reelId/challenges list.
 * correct_answer and explanation are intentionally omitted from this response.
 */
export class ChallengeResponseDto {
    @ApiProperty({
        example: "019501a0-0000-7000-8000-000000000001",
        description: "UUID v7 of the challenge.",
    })
    id!: string;

    @ApiProperty({
        example: "019501a0-0000-7000-8000-000000000002",
        description: "UUID v7 of the reel this challenge belongs to.",
    })
    reel_id!: string;

    @ApiProperty({
        example: "mcq",
        enum: CHALLENGE_TYPES,
        description:
            "Challenge type. mcq and true_false include options[]. " +
            "code_fill and output_prediction have options: null.",
    })
    type!: string;

    @ApiProperty({
        example:
            "Which array method returns a new array with transformed elements?",
        description:
            "The challenge question text. For code_fill, contains ___ placeholder.",
    })
    question!: string;

    @ApiProperty({
        example: ["forEach", "map", "filter", "reduce"],
        nullable: true,
        type: [String],
        description:
            "Answer options. Present for mcq (4 items) and true_false (2 items). " +
            "null for code_fill and output_prediction.",
    })
    options!: string[] | null;

    @ApiProperty({
        example: "intermediate",
        enum: CHALLENGE_DIFFICULTIES,
        description: "Challenge difficulty level.",
    })
    difficulty!: string;

    @ApiProperty({
        example: 20,
        description:
            "XP awarded for a correct answer. 0 for incorrect attempts.",
    })
    xp_reward!: number;

    @ApiProperty({
        example: 1,
        description: "1-indexed position of this challenge within the reel.",
    })
    order!: number;

    @ApiProperty({
        type: () => ChallengeAttemptStatusDto,
        description:
            "The requesting user's latest attempt status for this challenge.",
    })
    attempt!: ChallengeAttemptStatusDto;
}
