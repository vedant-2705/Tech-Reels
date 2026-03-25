/**
 * @module modules/challenges/dto/update-challenge.dto
 * @description
 * Request DTO for PATCH /challenges/:id.
 * All fields are optional - only provided fields are updated (COALESCE in repository).
 *
 * Cross-field validation (options consistency with type) is enforced in the
 * service when both type and options are present in the same request.
 * If only options are updated without changing type, the existing type from
 * the DB is used for validation.
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
 * Validated partial update payload for an existing challenge.
 * At least one field must be provided (enforced in service).
 */
export class UpdateChallengeDto {
    @ApiProperty({
        example: "code_fill",
        enum: CHALLENGE_TYPES,
        required: false,
        description:
            "New challenge type. " +
            "If changing type, options[] must also be updated consistently.",
    })
    @IsOptional()
    @IsEnum(CHALLENGE_TYPES)
    type?: ChallengeType;

    @ApiProperty({
        example: "Which array method returns a new array?",
        required: false,
        maxLength: 1000,
        description: "Updated question text.",
    })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(1000)
    question?: string;

    @ApiProperty({
        example: ["forEach", "map", "filter", "reduce"],
        nullable: true,
        required: false,
        type: [String],
        description:
            "Updated answer options. " +
            "Pass null to clear options when changing to code_fill or output_prediction.",
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @IsNotEmpty({ each: true })
    @ArrayMaxSize(4)
    options?: string[] | null;

    @ApiProperty({
        example: 2,
        required: false,
        description:
            "Updated correct answer (index for mcq/true_false, string for others).",
    })
    @IsOptional()
    @IsNotEmpty()
    correct_answer?: string | number;

    @ApiProperty({
        example: "map() is the correct choice here.",
        required: false,
        maxLength: 1000,
        description: "Updated explanation.",
    })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(1000)
    explanation?: string;

    @ApiProperty({
        example: "advanced",
        enum: CHALLENGE_DIFFICULTIES,
        required: false,
        description: "Updated difficulty level.",
    })
    @IsOptional()
    @IsEnum(CHALLENGE_DIFFICULTIES)
    difficulty?: ChallengeDifficulty;

    @ApiProperty({
        example: true,
        required: false,
        description:
            "Updated case_sensitive flag (code_fill / output_prediction only).",
    })
    @IsOptional()
    @IsBoolean()
    case_sensitive?: boolean;

    @ApiProperty({
        example: 2,
        required: false,
        description: "Updated 1-indexed display order within the reel.",
    })
    @IsOptional()
    @IsNumber()
    @Min(1)
    order?: number;
}
