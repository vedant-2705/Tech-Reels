/**
 * @module common/exceptions/invalid.exception
 * @description
 * Base class for all 422 Unprocessable Entity exceptions across the application.
 * Used when input is syntactically valid but semantically wrong -
 * e.g. a UUID that is well-formed but doesn't reference an existing record.
 *
 * Inheritance chain:
 *   HttpException -> AppException -> InvalidException -> {Module}InvalidException
 *
 * Examples:
 *   InvalidTopicsException    (common - used by auth + users)
 *   InvalidAvatarKeyException (users module)
 */

import { HttpStatus } from "@nestjs/common";
import { AppException } from "./app.exception";

export class InvalidException extends AppException {
    /**
     * @param type   RFC 7807 type URL e.g. 'https://techreel.io/errors/invalid-topics'
     * @param title  Short human-readable summary e.g. 'Invalid Topics'
     * @param detail Fuller explanation shown to the client
     */
    constructor(type: string, title: string, detail: string) {
        super({ type, title, status: HttpStatus.UNPROCESSABLE_ENTITY, detail });
    }
}
