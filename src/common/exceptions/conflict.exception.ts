/**
 * @module common/exceptions/conflict.exception
 * @description
 * Base class for all 409 Conflict exceptions across the application.
 * Module-specific conflict exceptions extend this class and pass their
 * own type URL, title, and detail message.
 *
 * Inheritance chain:
 *   HttpException → AppException → ConflictException → {Module}ConflictException
 *
 * Examples:
 *   EmailConflictException    (auth module)
 *   UsernameConflictException (common - used by auth + users)
 *   TagConflictException      (tags module)
 */

import { HttpStatus } from "@nestjs/common";
import { AppException } from "./app.exception";

export class ConflictException extends AppException {
    /**
     * @param type   RFC 7807 type URL e.g. 'https://techreel.io/errors/tag-conflict'
     * @param title  Short human-readable summary e.g. 'Tag Already Exists'
     * @param detail Fuller explanation shown to the client
     */
    constructor(type: string, title: string, detail: string) {
        super({ type, title, status: HttpStatus.CONFLICT, detail });
    }
}
