/**
 * @module modules/challenges/exceptions/invalid-challenge-payload.exception
 * @description
 * Thrown when a challenge creation or update payload is semantically invalid -
 * i.e. syntactically valid JSON that violates cross-field business rules:
 *   - options[] provided for code_fill / output_prediction
 *   - options[] missing or wrong length for mcq / true_false
 *   - correct_answer index out of range for mcq / true_false
 *   - reel has reached the maximum allowed challenges (3)
 *   - creator does not own the reel
 *
 * Inheritance chain:
 *   HttpException -> AppException -> InvalidChallengePayloadException
 *
 * type: https://techreel.io/errors/invalid-challenge-payload
 */

import { InvalidException } from "@common/exceptions/invalid.exception";

/**
 * 422 - The challenge payload violates one or more business rules.
 */
export class InvalidChallengePayloadException extends InvalidException {
    /**
     * @param detail Human-readable explanation of the specific violation.
     */
    constructor(detail: string) {
        super(
            "challenge-payload",
            "Invalid Challenge Payload",
            detail,
        );
    }
}
