/**
 * @module modules/challenges/exceptions/challenge-not-found.exception
 * @description
 * Thrown when a challenge lookup by ID returns no result.
 *
 * Inheritance chain:
 *   HttpException -> AppException -> NotFoundException -> ChallengeNotFoundException
 *
 * type: https://techreel.io/errors/challenge-not-found
 */

import { NotFoundException } from "@common/exceptions/not-found.exception";

/**
 * 404 - No challenge found with the provided ID.
 */
export class ChallengeNotFoundException extends NotFoundException {
    constructor() {
        super("challenge", "No challenge found with this ID");
    }
}
