/**
 * @module common/exceptions/email-conflict.exception
 * @description
 * Exception thrown when attempting to register or link an email
 * that already belongs to another account.
 */

import { AppException } from "./app.exception";
import { HttpStatus } from "@nestjs/common";

/**
 * Thrown when a user tries to register with an email that is already in use, or tries to link an email that belongs to another account.
 */
export class EmailConflictException extends AppException {
    constructor() {
        super({
            type: "https://techreel.io/errors/email-conflict",
            title: "Email Already Registered",
            status: HttpStatus.CONFLICT,
            detail: "An account with this email already exists",
        });
    }
}
