/**
 * @module modules/users/exceptions/profile-not-found.exception
 * @description
 * Thrown when a recruiter-facing profile lookup by public token finds no
 * active user. Inactive accounts return 404 so account state is never
 * revealed to unauthenticated callers.
 */

import { NotFoundException } from '@common/exceptions/not-found-exception';

/**
 * Raised when a public profile token resolves to no user, or the
 * account is not active. HTTP 404.
 */
export class ProfileNotFoundException extends NotFoundException {
    constructor() {
        super(
            'profile',
            'The requested public profile does not exist.'
        );
    }
}
