/**
 * @module common/exceptions/account-not-active.exception
 * @description
 * Exception for authenticated users whose account status is not active.
 * Maps suspended, banned, and deactivated states to user-facing messages.
 */

import { AppException } from "./app.exception";
import { HttpStatus } from "@nestjs/common";

type InactiveStatus = "suspended" | "banned" | "deactivated";

const MESSAGES: Record<InactiveStatus, string> = {
    suspended: "Your account has been temporarily suspended. Contact support.",
    banned: "Your account has been permanently banned.",
    deactivated: "Your account is deactivated. Would you like to reactivate?",
};

/**
 * Thrown when an authenticated user tries to access resources but their account is not active.
 */
export class AccountNotActiveException extends AppException {
    /**
     * @param status The specific inactive status of the account.
     */
    constructor(status: InactiveStatus) {
        super({
            type: "https://techreel.io/errors/account-not-active",
            title: "Account Not Active",
            status: HttpStatus.FORBIDDEN,
            detail: MESSAGES[status],
        });
    }
}
