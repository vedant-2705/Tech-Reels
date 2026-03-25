/**
 * @module modules/challenges/exceptions/idempotency-conflict.exception
 * @description
 * Thrown when a client reuses an X-Idempotency-Key header with a different
 * request body. The key was already processed with a different answer -
 * reusing it with a changed payload is not permitted.
 *
 * Inheritance chain:
 *   HttpException -> AppException -> IdempotencyConflictException
 *
 * type: https://techreel.io/errors/idempotency-conflict
 */

import { ConflictException } from "@common/exceptions/conflict.exception";

/**
 * 409 - The idempotency key was already used with a different request body.
 */
export class IdempotencyConflictException extends ConflictException {
    constructor() {
        super(
            "idempotency-key",
            "Idempotency Key Conflict",
            "This idempotency key was already used with a different request body. " +
            "Generate a new key for a different submission.",
        );
    }
}
