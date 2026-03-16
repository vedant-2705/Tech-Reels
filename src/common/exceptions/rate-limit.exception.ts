/**
 * @module common/exceptions/rate-limit.exception
 * @description
 * Generic rate-limit exception that returns retry timing in seconds.
 */

import { AppException } from "./app.exception";
import { HttpStatus } from "@nestjs/common";

/**
 * Thrown when a client exceeds the allowed number of requests in a given time window, indicating how long to wait before retrying.
 */
export class RateLimitException extends AppException {
    /**
     * @param retryAfter The number of seconds to wait before retrying.
     */
    constructor(retryAfter: number) {
        super({
            type: "https://techreel.io/errors/rate-limit",
            title: "Too Many Requests",
            status: HttpStatus.TOO_MANY_REQUESTS,
            detail: `Too many requests. Try again after ${retryAfter} seconds.`,
        });
    }
}
