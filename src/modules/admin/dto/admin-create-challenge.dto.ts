/**
 * @module modules/admin/dto/admin-create-challenge.dto
 * @description
 * Request and response DTOs for POST /admin/reels/:id/challenges.
 */

import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
    ArrayMinSize,
    ArrayMaxSize,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Valid challenge types accepted by the admin create endpoint.
 * Mirrors challenge_type DB enum values that have evaluators implemented.
 */
const CHALLENGE_TYPES = [
    "mcq",
    "code_fill",
    "true_false",
    "output_prediction",
] as const;
type ChallengeType = (typeof CHALLENGE_TYPES)[number];

/**
 * Valid difficulty levels - mirrors difficulty_level DB enum.
 */
const DIFFICULTY_LEVELS = ["beginner", "intermediate", "advanced"] as const;
type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

/**
 * Request body for creating a challenge on a reel via the admin endpoint.
 *
 * correct_answer storage rules:
 *   mcq / true_false  - 0-indexed string position of correct option (e.g. "1").
 *                        Client sends a number; service calls String(dto.correct_answer).
 *   code_fill / output_prediction - exact expected string stored as-is.
 */
export class AdminCreateChallengeDto {
    @ApiProperty({
        example: "mcq",
        description:
            "Challenge type. One of: mcq, code_fill, true_false, output_prediction.",
        enum: CHALLENGE_TYPES,
    })
    @IsEnum(CHALLENGE_TYPES)
    type!: ChallengeType;

    @ApiProperty({
        example: "Which array method returns a new array of the same length?",
        description: "Challenge question text. Min 10, max 1000 characters.",
        minLength: 10,
        maxLength: 1000,
    })
    @IsString()
    @IsNotEmpty()
    @MinLength(10)
    @MaxLength(1000)
    question!: string;

    @ApiPropertyOptional({
        example: ["forEach", "map", "filter", "reduce"],
        description:
            "Answer options. Required for mcq (exactly 4 strings). " +
            'Required for true_false (exactly ["True", "False"]). ' +
            "Omit for code_fill and output_prediction.",
        type: [String],
        minItems: 2,
        maxItems: 4,
    })
    @IsOptional()
    @IsArray()
    @ArrayMinSize(2)
    @ArrayMaxSize(4)
    @IsString({ each: true })
    options?: string[];

    @ApiProperty({
        example: "1",
        description:
            "Correct answer. " +
            'For mcq/true_false: send the 0-indexed position of the correct option as a string or number (e.g. 1 or "1"). ' +
            "For code_fill/output_prediction: send the exact expected string. " +
            "Always persisted as TEXT.",
    })
    @IsNotEmpty()
    correct_answer!: string | number;

    @ApiProperty({
        example:
            "Array.map() always returns a new array with the same number of elements.",
        description:
            "Explanation shown after the user answers. Min 10, max 1000 characters.",
        minLength: 10,
        maxLength: 1000,
    })
    @IsString()
    @IsNotEmpty()
    @MinLength(10)
    @MaxLength(1000)
    explanation!: string;

    @ApiProperty({
        example: "intermediate",
        description:
            "Difficulty level. Determines xp_reward: beginner=10, intermediate=20, advanced=30.",
        enum: DIFFICULTY_LEVELS,
    })
    @IsEnum(DIFFICULTY_LEVELS)
    difficulty!: DifficultyLevel;

    @ApiPropertyOptional({
        example: false,
        description:
            "For code_fill only - whether comparison is case-sensitive. Default false.",
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    case_sensitive?: boolean = false;
}

/**
 * Response body for the created challenge.
 */
export class AdminChallengeResponseDto {
    @ApiProperty({
        example: "019501a0-0000-7000-8000-000000000030",
        description: "Challenge UUID v7.",
    })
    id!: string;

    @ApiProperty({
        example: "019501a0-0000-7000-8000-000000000010",
        description: "Reel UUID this challenge belongs to.",
    })
    reel_id!: string;

    @ApiProperty({
        example: "mcq",
        description: "Challenge type.",
    })
    type!: string;

    @ApiProperty({
        example: "Which array method returns a new array of the same length?",
        description: "Challenge question.",
    })
    question!: string;

    @ApiPropertyOptional({
        example: ["forEach", "map", "filter", "reduce"],
        description:
            "Answer options. Null for code_fill and output_prediction.",
        nullable: true,
        type: [String],
    })
    options!: string[] | null;

    @ApiProperty({
        example:
            "Array.map() always returns a new array with the same number of elements.",
        description: "Explanation shown after the user answers.",
    })
    explanation!: string;

    @ApiProperty({
        example: "intermediate",
        description: "Difficulty level.",
    })
    difficulty!: string;

    @ApiProperty({
        example: 20,
        description: "XP reward awarded on correct answer.",
    })
    xp_reward!: number;

    @ApiProperty({
        example: 4,
        description: "Token reward awarded on correct answer.",
    })
    token_reward!: number;

    @ApiProperty({
        example: false,
        description: "Whether code_fill comparison is case-sensitive.",
    })
    case_sensitive!: boolean;

    @ApiProperty({
        example: 1,
        description: "Display order within the reel (1-indexed).",
    })
    order!: number;

    @ApiProperty({
        example: 3,
        description: "Maximum number of attempts allowed.",
    })
    max_attempts!: number;

    @ApiProperty({
        example: "2026-03-31T14:00:00.000Z",
        description: "ISO 8601 creation timestamp.",
    })
    created_at!: string;

    @ApiProperty({
        example: "2026-03-31T14:00:00.000Z",
        description: "ISO 8601 last-updated timestamp.",
    })
    updated_at!: string;
}
