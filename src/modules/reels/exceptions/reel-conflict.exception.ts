/**
 * @module modules/reels/exceptions/reel-conflict.exception
 * @description
 * Thrown when attempting to create a reel that conflicts with an existing record,
 * e.g. duplicate S3 key.
 */

import { ConflictException } from "@common/exceptions/conflict.exception";

/**
 * 409 Conflict - a reel with this key already exists.
 */
export class ReelConflictException extends ConflictException {
    constructor() {
        super(
            "reel",
            "Reel Already Exists",
            "A reel with this key already exists",
        );
    }
}
