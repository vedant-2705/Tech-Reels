/**
 * @module skill-paths/exceptions/invalid-path-reels.exception
 * @description
 * Thrown when one or more reel IDs provided in CreatePathDto or UpdatePathDto
 * do not exist in the database, are not in 'active' status, or are soft-deleted.
 */

import { InvalidException } from "@common/exceptions/invalid.exception";

/**
 * 422 Unprocessable Entity - the request was well-formed but semantically invalid.
 */
export class InvalidPathReelsException extends InvalidException {
    constructor() {
        super(
            "path-reels",
            "Invalid Path Reels",
            "One or more reel IDs do not exist or are not active",
        );
    }
}
