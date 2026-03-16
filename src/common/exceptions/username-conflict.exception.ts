import { AppException } from "./app.exception";
import { HttpStatus } from "@nestjs/common";

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
