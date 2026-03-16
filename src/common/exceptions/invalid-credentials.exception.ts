import { AppException } from "./app.exception";
import { HttpStatus } from "@nestjs/common";

export class InvalidCredentialsException extends AppException {
    constructor() {
        super({
            type: "https://techreel.io/errors/invalid-credentials",
            title: "Invalid Credentials",
            status: HttpStatus.UNAUTHORIZED,
            detail: "Email or password is incorrect",
        });
    }
}
