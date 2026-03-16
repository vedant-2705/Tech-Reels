import { AppException } from "./app.exception";
import { HttpStatus } from "@nestjs/common";

type InactiveStatus = "suspended" | "banned" | "deactivated";

const MESSAGES: Record<InactiveStatus, string> = {
    suspended: "Your account has been temporarily suspended. Contact support.",
    banned: "Your account has been permanently banned.",
    deactivated: "Your account is deactivated. Would you like to reactivate?",
};

export class AccountNotActiveException extends AppException {
    constructor(status: InactiveStatus) {
        super({
            type: "https://techreel.io/errors/account-not-active",
            title: "Account Not Active",
            status: HttpStatus.FORBIDDEN,
            detail: MESSAGES[status],
        });
    }
}
