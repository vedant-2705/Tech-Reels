/**
 * @module modules/challenges/dto/attempt-result.dto
 * @description
 * Response DTO for POST /challenges/:id/attempt.
 * Reveals the correct answer and explanation after every attempt.
 * badges_earned is always an empty array - populated asynchronously by the badge worker.
 */

import { ApiProperty } from "@nestjs/swagger";

/**
 * Full result envelope returned after a challenge attempt is evaluated.
 */
export class AttemptResultDto {
    @ApiProperty({
        example: true,
        description: "Whether the submitted answer was correct.",
    })
    is_correct!: boolean;

    @ApiProperty({
        example: 1,
        description:
            "The correct answer, revealed after every attempt. " +
            "Number for mcq / true_false (0-indexed option index). " +
            "String for code_fill / output_prediction.",
    })
    correct_answer!: string | number;

    @ApiProperty({
        example:
            "Array.map() returns a new array by applying a callback to each element.",
        description:
            "Explanation of the correct answer. Always shown regardless of attempt result.",
    })
    explanation!: string;

    @ApiProperty({
        example: 20,
        description:
            "XP awarded for this attempt. 0 if the answer was incorrect.",
    })
    xp_awarded!: number;

    @ApiProperty({
        example: 1,
        description: "Which attempt number this was (1, 2, or 3).",
    })
    attempt_number!: number;

    @ApiProperty({
        example: 2,
        description:
            "Attempts remaining after this submission. " +
            "0 if the challenge is now locked (correct answer or max attempts reached).",
    })
    attempts_left!: number;

    @ApiProperty({
        example: 340,
        description: "The user's updated total XP after this attempt.",
    })
    new_total_xp!: number;

    @ApiProperty({
        example: [],
        type: [String],
        description:
            "Badges earned. Always an empty array in this response - " +
            "populated asynchronously by the badge evaluation worker.",
    })
    badges_earned!: never[];
}
