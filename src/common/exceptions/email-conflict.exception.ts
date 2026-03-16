import { AppException } from "./app.exception";
import { HttpStatus } from "@nestjs/common";

export class EmailConflictException extends AppException {
    constructor() {
        super({
            type: "https://techreel.io/errors/email-conflict",
            title: "Email Already Registered",
            status: HttpStatus.CONFLICT,
            detail: "An account with this email already exists",
        });
    }
}
