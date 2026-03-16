/**
 * @module common/exceptions/username-conflict.exception
 * @description
 * Conflict exception thrown when a username is already taken.
 */

import { AppException } from "./app.exception";
import { HttpStatus } from "@nestjs/common";

/**
 * Thrown when a user attempts to register with a username that already exists in the database, indicating they need to choose a different username.
 */
export class UsernameConflictException extends AppException {
    constructor() {
        super({
            type: "https://techreel.io/errors/username-conflict",
            title: "Username Taken",
            status: HttpStatus.CONFLICT,
            detail: "This username is already in use",
        });
    }
}
