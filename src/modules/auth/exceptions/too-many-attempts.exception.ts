/**
 * @module common/exceptions/too-many-attempts.exception
 * @description
 * Authentication rate-limit exception for repeated failed login attempts.
 */

import { AppException } from "../../../common/exceptions/app.exception";
import { HttpStatus } from "@nestjs/common";

/**
 * Thrown by AuthService.login() when 5+ failed attempts
 * are recorded for the same IP+email within 15 minutes.
 *
 * Distinct from RateLimitException - title and detail match the Auth LLD exactly.
 * retry_after is returned in the response body so the client knows when to retry.
 */
export class TooManyAttemptsException extends AppException {
    /**
     * @param retryAfter The number of seconds to wait before retrying.
     */
    constructor(retryAfter: number) {
        super({
            type: "https://techreel.io/errors/rate-limit",
            title: "Too Many Login Attempts",
            status: HttpStatus.TOO_MANY_REQUESTS,
            detail: `Too many failed attempts. Try again after ${retryAfter} seconds.`,
            errors: [{ field: "retry_after", message: String(retryAfter) }],
        });
    }
}
