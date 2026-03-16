/**
 * @module common/exceptions/invalid-credentials.exception
 * @description
 * Authentication exception for invalid email/password credentials.
 */

import { AppException } from "./app.exception";
import { HttpStatus } from "@nestjs/common";

/**
 * Thrown when a user attempts to authenticate with incorrect email or password.
 */
export class InvalidCredentialsException extends AppException {
    constructor() {
        super({
            type: "https://techreel.io/errors/invalid-credentials",
            title: "Invalid Credentials",
            status: HttpStatus.UNAUTHORIZED,
            detail: "Email or password is incorrect",
        });
    }
}
