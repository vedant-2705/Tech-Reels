import { AppException } from "./app.exception";
import { HttpStatus } from "@nestjs/common";

export class ForbiddenException extends AppException {
    constructor(detail = "You do not have permission to perform this action") {
        super({
            type: "https://techreel.io/errors/forbidden",
            title: "Forbidden",
            status: HttpStatus.FORBIDDEN,
            detail,
        });
    }
}
