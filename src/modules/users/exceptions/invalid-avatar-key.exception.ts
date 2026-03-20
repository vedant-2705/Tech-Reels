/**
 * @module modules/users/exceptions/invalid-avatar-key.exception
 * @description
 * Thrown when an avatar confirm request references a key that is either
 * absent from the pending-avatar cache or not found in S3.
 */
import { InvalidException } from "@common/exceptions/invalid.exception";

export class InvalidAvatarKeyException extends InvalidException {
    constructor() {
        super(
            "avatar-key",
            "Invalid Avatar Key",
            "The provided avatar key was not found or has expired.",
        );
    }
}
