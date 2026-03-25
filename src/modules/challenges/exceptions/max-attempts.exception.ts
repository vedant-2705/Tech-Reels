/**
 * @module modules/challenges/exceptions/max-attempts.exception
 * @description
 * Thrown when a user has exhausted all allowed attempts for a challenge.
 * Extends AppException directly because no base class covers 429 with a
 * non-rate-limit semantic (this is a business-rule limit, not an IP limit).
 *
 * Inheritance chain:
 *   HttpException -> AppException -> MaxAttemptsException
 *
 * type: https://techreel.io/errors/max-attempts
 */

import { HttpStatus } from "@nestjs/common";
import { AppException } from "@common/exceptions/app.exception";

/**
 * 429 - The user has used all 3 attempts for this challenge.
 */
export class MaxAttemptsException extends AppException {
    constructor() {
        super({
            type: "https://techreel.io/errors/max-attempts",
            title: "Max Attempts Reached",
            status: HttpStatus.TOO_MANY_REQUESTS,
            detail: "You have used all attempts for this challenge",
        });
    }
}
