/**
 * @module common/exceptions/token-reuse.exception
 * @description
 * Security exception raised when refresh-token replay or reuse is detected.
 */

import { AppException } from "./app.exception";
import { HttpStatus } from "@nestjs/common";

/**
 * Thrown when a refresh token is used more than once, indicating a potential security breach. This exception should trigger the invalidation of all active sessions for the user to protect their account.
 */
export class TokenReuseException extends AppException {
    constructor() {
        super({
            type: "https://techreel.io/errors/token-reuse",
            title: "Security Alert",
            status: HttpStatus.UNAUTHORIZED,
            detail: "Invalid session detected. All sessions have been terminated for your safety.",
        });
    }
}
