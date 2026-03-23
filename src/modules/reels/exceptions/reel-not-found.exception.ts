/**
 * @module modules/reels/exceptions/reel-not-found.exception
 * @description
 * Thrown when a requested reel cannot be found in the database,
 * or when a non-active reel is accessed on a public (unauthenticated) endpoint.
 */

import { NotFoundException } from "@common/exceptions/not-found.exception";

/**
 * 404 Not Found - no reel exists with the given ID (or it is not publicly visible).
 */
export class ReelNotFoundException extends NotFoundException {
    /**
     * @param detail Optional custom detail message.
     */
    constructor(detail?: string) {
        super("reel", detail ?? "No reel found with this ID");
    }
}
