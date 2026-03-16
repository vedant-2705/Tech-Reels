import { AppException } from "./app.exception";
import { HttpStatus } from "@nestjs/common";

export class InvalidProviderException extends AppException {
    constructor() {
        super({
            type: "https://techreel.io/errors/invalid-provider",
            title: "Invalid Provider",
            status: HttpStatus.BAD_REQUEST,
            detail: "Provider must be google or github",
        });
    }
}
