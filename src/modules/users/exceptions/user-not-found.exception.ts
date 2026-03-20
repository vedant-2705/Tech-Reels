/**
 * @module modules/users/exceptions/user-not-found.exception
 * @description
 * Thrown when a public profile lookup by username finds no active user.
 * Returns 404 for all non-active account statuses so account state is
 * never revealed to unauthenticated callers.
 */

import { NotFoundException } from '@common/exceptions/not-found.exception';

/**
 * Raised when a user cannot be found by username, or their account is
 * not active. HTTP 404.
 */
export class UserNotFoundException extends NotFoundException {
    constructor() {
        super(
            'user',
            'The requested user does not exist.'
        );
    }
}
