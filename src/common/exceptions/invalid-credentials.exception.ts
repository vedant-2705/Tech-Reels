/**
 * @module common/exceptions/invalid-credentials.exception
 * @description
 * Authentication exception for invalid email/password credentials.
 */

import { InvalidException } from "./invalid.exception";

/**
 * Thrown when a user attempts to authenticate with incorrect email or password.
 */
export class InvalidCredentialsException extends InvalidException {
    constructor() {
        super(
            "credentials",
            "Invalid Credentials",
            "Email or password is incorrect",
        );
    }
}
