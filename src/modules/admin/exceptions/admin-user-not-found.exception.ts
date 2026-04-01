/**
 * @module modules/admin/exceptions/admin-user-not-found.exception
 * @description
 * Thrown when a user cannot be found by the given ID in an admin context.
 * Distinct from the auth module's not-found - admin sees soft-deleted users.
 */

import { NotFoundException } from "@common/exceptions/not-found.exception";

/**
 * 404 - User not found (admin context).
 */
export class AdminUserNotFoundException extends NotFoundException {
    constructor() {
        super(
            "user",
            "No user was found with the provided ID.",
        );
    }
}
