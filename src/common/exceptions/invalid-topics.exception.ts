/**
 * @module common/exceptions/invalid-topics.exception
 * @description
 * Validation exception for one or more topic identifiers that do not exist.
 */

import { AppException } from "./app.exception";
import { HttpStatus } from "@nestjs/common";

/**
 * Thrown when a user attempts to create or update a reel with topic IDs that do not exist in the database.
 */
export class InvalidTopicsException extends AppException {
    constructor() {
        super({
            type: "https://techreel.io/errors/invalid-topics",
            title: "Invalid Topics",
            status: HttpStatus.UNPROCESSABLE_ENTITY,
            detail: "One or more topic IDs do not exist",
        });
    }
}
