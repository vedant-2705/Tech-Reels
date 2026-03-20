/**
 * @module common/exceptions/session-expired.exception
 * @description
 * Authentication exception for expired or invalid refresh session state.
 */

import { AppException } from "../../../common/exceptions/app.exception";
import { HttpStatus } from "@nestjs/common";

/**
 * Thrown when a user's session has expired or the refresh token is invalid, indicating they need to log in again to obtain a new session.
 */
export class SessionExpiredException extends AppException {
    constructor() {
        super({
            type: "https://techreel.io/errors/session-expired",
            title: "Session Expired",
            status: HttpStatus.UNAUTHORIZED,
            detail: "Your session has expired. Please log in again.",
        });
    }
}
