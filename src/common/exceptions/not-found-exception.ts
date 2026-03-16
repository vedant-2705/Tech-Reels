import { AppException } from "./app.exception";
import { HttpStatus } from "@nestjs/common";

export class NotFoundException extends AppException {
    constructor(resource: string) {
        super({
            type: `https://techreel.io/errors/${resource}-not-found`,
            title: "Not Found",
            status: HttpStatus.NOT_FOUND,
            detail: `The requested ${resource} was not found`,
        });
    }
}
