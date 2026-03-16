import { AppException } from "./app.exception";
import { HttpStatus } from "@nestjs/common";

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
