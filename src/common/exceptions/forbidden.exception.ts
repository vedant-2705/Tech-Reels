/**
 * @module common/exceptions/forbidden.exception
 * @description
 * Authorization exception for requests where the authenticated user
 * does not have permission to perform the requested action.
 */

import { AppException } from "./app.exception";
import { HttpStatus } from "@nestjs/common";

/**
 * Thrown when an authenticated user tries to access a resource or perform an action they don't have permissions for.
 */
export class ForbiddenException extends AppException {
    /**
     * @param detail The detail message for the exception. Defaults to a generic permission error message.
     */
    constructor(detail = "You do not have permission to perform this action") {
        super({
            type: "https://techreel.io/errors/forbidden",
            title: "Forbidden",
            status: HttpStatus.FORBIDDEN,
            detail,
        });
    }
}
