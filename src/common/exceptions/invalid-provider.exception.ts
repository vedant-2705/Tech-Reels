/**
 * @module common/exceptions/invalid-provider.exception
 * @description
 * Validation exception for unsupported OAuth providers in auth endpoints.
 */

import { AppException } from "./app.exception";
import { HttpStatus } from "@nestjs/common";

/**
 * Thrown when a user attempts to authenticate with an unsupported provider.
 */
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
