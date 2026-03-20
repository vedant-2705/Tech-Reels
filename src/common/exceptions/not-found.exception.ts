/**
 * @module common/exceptions/not-found-exception
 * @description
 * Generic resource-not-found exception used when an entity lookup fails.
 */

import { AppException } from "./app.exception";
import { HttpStatus } from "@nestjs/common";

/**
 * Thrown when a requested resource (user, reel, comment, etc.) cannot be found in the database.
 */
export class NotFoundException extends AppException {
    /**
     * @param resource The type of resource that was not found, used to generate a specific error message and type URL. Examples: "user", "reel", "comment".
     * @param detail Optional custom detail message for the exception.
     */
    constructor(resource: string, detail?: string) {
        super({
            type: `https://techreel.io/errors/${resource}-not-found`,
            title: "Not Found",
            status: HttpStatus.NOT_FOUND,
            detail: detail ?? `The requested ${resource} was not found`,
        });
    }
}
