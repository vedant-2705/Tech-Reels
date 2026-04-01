/**
 * @module modules/admin/exceptions/admin-challenge-not-found.exception
 * @description
 * Thrown when a challenge cannot be found by the given ID and reel ID,
 * or when it has already been soft-deleted.
 */

import { NotFoundException } from "@common/exceptions/not-found.exception";

/**
 * 404 - Challenge not found or already deleted (admin context).
 */
export class AdminChallengeNotFoundException extends NotFoundException {
    constructor() {
        super(
            "challenge",
            "No active challenge was found with the provided ID on this reel.",
        );
    }
}
