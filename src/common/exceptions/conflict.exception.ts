/**
 * @module common/exceptions/conflict.exception
 * @description
 * Base class for all 409 Conflict exceptions across the application.
 * Module-specific conflict exceptions extend this class and pass their
 * own type URL, title, and detail message.
 *
 * Inheritance chain:
 *   HttpException -> AppException -> ConflictException -> {Module}ConflictException
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
     * @param slug   Resource/error name e.g. 'email', 'username', 'tag'
     * @param title  Short human-readable summary e.g. 'Email Already Registered'
     * @param detail Fuller explanation shown to the client
     */
    constructor(slug: string, title: string, detail: string) {
        super({
            type: `https://techreel.io/errors/${slug}-conflict`,
            title,
            status: HttpStatus.CONFLICT,
            detail,
        });
    }
}
