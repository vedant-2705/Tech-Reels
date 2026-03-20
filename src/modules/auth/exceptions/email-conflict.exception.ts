/**
 * @module common/exceptions/email-conflict.exception
 * @description
 * Exception thrown when attempting to register or link an email
 * that already belongs to another account.
 */

import { ConflictException } from "@common/exceptions/conflict.exception";

/**
 * Thrown when a user tries to register with an email that is already in use, or tries to link an email that belongs to another account.
 */
export class EmailConflictException extends ConflictException {
    constructor() {
        super(
            "email",
            "Email Already Registered",
            "An account with this email already exists",
        );
    }
}
