/**
 * @module modules/challenges/dto/submit-attempt.dto
 * @description
 * Request DTO for POST /challenges/:id/attempt.
 *
 * The answer field accepts either a number (MCQ / true_false - 0-indexed option index)
 * or a string (code_fill / output_prediction - the fill-in or predicted output value).
 * Type-level discrimination is handled by the evaluator, not the DTO.
 */

import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty } from "class-validator";

/**
 * Validates the answer submitted for a challenge attempt.
 */
export class SubmitAttemptDto {
    @ApiProperty({
        example: 1,
        description:
            "Answer to submit. " +
            "For mcq and true_false: a number - the 0-indexed position in options[]. " +
            "For code_fill: a string - the exact fill-in value. " +
            "For output_prediction: a string - the expected output of the code snippet.",
    })
    @IsNotEmpty()
    answer!: string | number;
}
