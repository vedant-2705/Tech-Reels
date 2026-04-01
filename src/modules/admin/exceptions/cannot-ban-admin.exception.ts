/**
 * @module modules/admin/exceptions/cannot-ban-admin.exception
 * @description
 * Thrown when an admin attempts to suspend or ban another admin account.
 */

import { HttpStatus } from "@nestjs/common";
import { AppException } from "@common/exceptions/app.exception";

/**
 * 409 - Cannot apply punitive status to an admin account.
 */
export class CannotBanAdminException extends AppException {
    constructor() {
        super({
            type: "https://techreel.io/errors/cannot-ban-admin",
            title: "Cannot Modify Admin Account Status",
            status: HttpStatus.CONFLICT,
            detail: "Suspending or banning another admin account is not permitted.",
        });
    }
}
