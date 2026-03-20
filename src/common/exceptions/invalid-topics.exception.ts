/**
 * @module common/exceptions/invalid-topics.exception
 * @description
 * Validation exception for one or more topic identifiers that do not exist.
 */

import { InvalidException } from "./invalid.exception";

/**
 * Thrown when a user attempts to create or update a reel with topic IDs that do not exist in the database.
 */
export class InvalidTopicsException extends InvalidException {
    constructor() {
        super(
            "topics",
            "Invalid Topics",
            "One or more topic IDs do not exist",
        );
    }
}
