/**
 * @module modules/challenges/dto/create-challenge.dto
 * @description
 * Request DTO for POST /reels/:reelId/challenges.
 *
 * Cross-field validation (options vs type, correct_answer range) is handled
 * in the service layer via InvalidChallengePayloadException - these rules
 * cannot be expressed cleanly with class-validator alone.
 *
 * options rules (enforced in service):
 *   mcq        -> required, exactly 4 strings
 *   true_false -> required, exactly 2 strings
 *   code_fill  -> must be omitted / null
 *   output_prediction -> must be omitted / null
 */

import { ApiProperty } from "@nestjs/swagger";
import {
    IsEnum,
    IsString,
    IsNotEmpty,
    IsBoolean,
    IsOptional,
    IsArray,
    IsNumber,
    Min,
    MaxLength,
    ArrayMaxSize,
} from "class-validator";
import {
    CHALLENGE_DIFFICULTIES,
    CHALLENGE_TYPES,
    type ChallengeDifficulty,
    type ChallengeType,
} from "../challenges.constants";

/**
 * Validated payload for creating a new challenge attached to a reel.
 */
export class CreateChallengeDto {
    @ApiProperty({
        example: "mcq",
        enum: CHALLENGE_TYPES,
        description:
            "Challenge type. " +
            "mcq: provide options[] with 4 items. " +
            "true_false: provide options[] with 2 items. " +
            "code_fill: omit options, question contains ___ placeholder. " +
            "output_prediction: omit options, question contains code snippet.",
    })
    @IsEnum(CHALLENGE_TYPES)
    type!: ChallengeType;

    @ApiProperty({
        example:
            "Which array method returns a new array with transformed elements?",
        description:
            "The challenge question. " +
            "For code_fill, include ___ as the blank placeholder. " +
            "For output_prediction, include the full code snippet.",
        maxLength: 1000,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(1000)
    question!: string;

    @ApiProperty({
        example: ["forEach", "map", "filter", "reduce"],
        nullable: true,
        required: false,
        type: [String],
        description:
            "Answer options. " +
            "Required for mcq (exactly 4 items) and true_false (exactly 2 items). " +
            "Must be omitted or null for code_fill and output_prediction.",
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @IsNotEmpty({ each: true })
    @ArrayMaxSize(4)
    options?: string[] | null;

    @ApiProperty({
        example: 1,
        description:
            "The correct answer. " +
            "mcq / true_false: number - 0-indexed position in options[]. " +
            "code_fill: string - the exact fill-in value. " +
            "output_prediction: string - the exact expected output.",
    })
    @IsNotEmpty()
    correct_answer!: string | number;

    @ApiProperty({
        example:
            "Array.map() returns a new array by applying a callback to each element.",
        description: "Explanation shown to the user after every attempt.",
        maxLength: 1000,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(1000)
    explanation!: string;

    @ApiProperty({
        example: "intermediate",
        enum: CHALLENGE_DIFFICULTIES,
        description:
            "Difficulty level. Determines XP reward: beginner=10, intermediate=20, advanced=30.",
    })
    @IsEnum(CHALLENGE_DIFFICULTIES)
    difficulty!: ChallengeDifficulty;

    @ApiProperty({
        example: false,
        required: false,
        default: false,
        description:
            "Whether the answer comparison is case-sensitive. " +
            "Only meaningful for code_fill and output_prediction. " +
            "Defaults to false (case-insensitive).",
    })
    @IsOptional()
    @IsBoolean()
    case_sensitive?: boolean;

    @ApiProperty({
        example: 1,
        required: false,
        description:
            "1-indexed display order within the reel. " +
            "Defaults to the next available position if omitted.",
    })
    @IsOptional()
    @IsNumber()
    @Min(1)
    order?: number;
}
