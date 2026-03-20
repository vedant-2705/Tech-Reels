/**
 * @module modules/users/exceptions/invalid-avatar-key.exception
 * @description
 * Thrown when an avatar confirm request references a key that is either
 * absent from the pending-avatar cache or not found in S3.
 */

import { AppException } from "../../../common/exceptions/app.exception";
import { HttpStatus } from "@nestjs/common";

/**
 * Raised when the provided avatar key is not in Cache or not in S3.
 * HTTP 422.
 */
export class InvalidAvatarKeyException extends AppException {
    constructor() {
        super({
            type: "https://techreel.io/errors/invalid-avatar-key",
            title: "Invalid Avatar Key",
            status: HttpStatus.UNPROCESSABLE_ENTITY,
            detail: "The provided avatar key was not found or has expired.",
        });
    }
}
