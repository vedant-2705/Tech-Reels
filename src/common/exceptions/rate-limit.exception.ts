import { AppException } from "./app.exception";
import { HttpStatus } from "@nestjs/common";

export class RateLimitException extends AppException {
    constructor(retryAfter: number) {
        super({
            type: "https://techreel.io/errors/rate-limit",
            title: "Too Many Requests",
            status: HttpStatus.TOO_MANY_REQUESTS,
            detail: `Too many requests. Try again after ${retryAfter} seconds.`,
        });
    }
}
