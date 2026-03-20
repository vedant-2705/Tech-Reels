/**
 * @module common/exceptions/username-conflict.exception
 * @description
 * Conflict exception thrown when a username is already taken.
 */

import { ConflictException } from "./conflict.exception";

/**
 * Thrown when a user attempts to register with a username that already exists in the database, indicating they need to choose a different username.
 */
export class UsernameConflictException extends ConflictException {
    constructor() {
        super(
            "username",
            "Username Taken",
            "This username is already in use",
        );
    }
}
