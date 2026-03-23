/**
 * @module modules/reels/exceptions/invalid-reel-key.exception
 * @description
 * Thrown when the raw_key supplied to the confirm endpoint does not match
 * the pending key stored in Redis, or when the S3 object does not exist.
 */

import { InvalidException } from "@common/exceptions/invalid.exception";

/**
 * 422 Unprocessable Entity - the reel key is missing, expired, or mismatched.
 */
export class InvalidReelKeyException extends InvalidException {
    constructor() {
        super(
            "reel-key",
            "Invalid Reel Key",
            "The provided raw_key does not match the pending upload or the S3 object does not exist",
        );
    }
}
