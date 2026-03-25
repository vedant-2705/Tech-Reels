/**
 * @module modules/challenges/exceptions/already-completed.exception
 * @description
 * Thrown when a user attempts a challenge they have already answered correctly.
 * Extends AppException directly (not ConflictException) so the type URL is
 * exactly https://techreel.io/errors/already-completed - ConflictException
 * would append '-conflict' to the slug which does not match the API spec.
 *
 * Inheritance chain:
 *   HttpException -> AppException -> AlreadyCompletedException
 *
 * type: https://techreel.io/errors/already-completed
 */

import { HttpStatus } from "@nestjs/common";
import { AppException } from "@common/exceptions/app.exception";

/**
 * 409 - The user has already answered this challenge correctly.
 */
export class AlreadyCompletedException extends AppException {
    constructor() {
        super({
            type: "https://techreel.io/errors/already-completed",
            title: "Already Completed",
            status: HttpStatus.CONFLICT,
            detail: "You already answered this challenge correctly",
        });
    }
}
