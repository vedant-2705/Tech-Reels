import { AppException } from "./app.exception";
import { HttpStatus } from "@nestjs/common";

export class TokenReuseException extends AppException {
    constructor() {
        super({
            type: "https://techreel.io/errors/token-reuse",
            title: "Security Alert",
            status: HttpStatus.UNAUTHORIZED,
            detail: "Invalid session detected. All sessions have been terminated for your safety.",
        });
    }
}
