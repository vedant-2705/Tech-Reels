import { AppException } from "./app.exception";
import { HttpStatus } from "@nestjs/common";

export class InvalidTopicsException extends AppException {
    constructor() {
        super({
            type: "https://techreel.io/errors/invalid-topics",
            title: "Invalid Topics",
            status: HttpStatus.UNPROCESSABLE_ENTITY,
            detail: "One or more topic IDs do not exist",
        });
    }
}
