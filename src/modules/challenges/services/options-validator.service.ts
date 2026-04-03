import { Injectable } from "@nestjs/common";
import { CHALLENGE_OPTIONS_COUNT, CHALLENGE_TYPES_REQUIRING_OPTIONS, ChallengeType } from "../challenges.constants";
import { InvalidChallengePayloadException } from "../exceptions/invalid-challenge-payload.exception";

@Injectable()
export class OptionsValidatorService {
    /**
     * Validates the options[] / correct_answer combination for a given type.
     * Throws InvalidChallengePayloadException on any rule violation.
     *
     * Rules:
     *   mcq        -> options required, exactly 4 items, correct_answer 0-3
     *   true_false -> options required, exactly 2 items, correct_answer 0-1
     *   code_fill / output_prediction -> options must be null/omitted
     *
     * @param type          Effective challenge type.
     * @param options       Effective options value.
     * @param correctAnswer Effective correct_answer value.
     */
    public validateOptionsForType(
        type: string,
        options: string[] | null | undefined,
        correctAnswer: string | number,
    ): void {
        const requiresOptions = CHALLENGE_TYPES_REQUIRING_OPTIONS.has(
            type as ChallengeType,
        );

        if (requiresOptions) {
            const requiredCount =
                CHALLENGE_OPTIONS_COUNT[
                    type as keyof typeof CHALLENGE_OPTIONS_COUNT
                ];

            if (!options || options.length === 0) {
                throw new InvalidChallengePayloadException(
                    `options[] is required for challenge type "${type}" and must have ${requiredCount} items.`,
                );
            }

            if (options.length !== requiredCount) {
                throw new InvalidChallengePayloadException(
                    `challenge type "${type}" requires exactly ${requiredCount} options, got ${options.length}.`,
                );
            }

            // correct_answer must be a valid 0-based index
            const index = Number(correctAnswer);
            if (
                !Number.isInteger(index) ||
                index < 0 ||
                index >= (requiredCount ?? 0)
            ) {
                throw new InvalidChallengePayloadException(
                    `correct_answer for type "${type}" must be a number between 0 and ${(requiredCount ?? 1) - 1}.`,
                );
            }
        } else {
            // code_fill / output_prediction must not have options
            if (options && options.length > 0) {
                throw new InvalidChallengePayloadException(
                    `options[] must be omitted for challenge type "${type}".`,
                );
            }

            // correct_answer must be a non-empty string
            if (
                typeof correctAnswer !== "string" ||
                correctAnswer.trim() === ""
            ) {
                throw new InvalidChallengePayloadException(
                    `correct_answer for type "${type}" must be a non-empty string.`,
                );
            }
        }
    }
}
