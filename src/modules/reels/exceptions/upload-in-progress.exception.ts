/**
 * @module modules/reels/exceptions/upload-in-progress.exception
 * @description
 * Thrown when a creator attempts to initiate a new reel upload while another
 * upload is already in progress for the same user.
 *
 * Protected by a Redis distributed lock (SET NX EX) on POST /reels.
 * The lock key is lock:upload:{userId} with a 30-second TTL.
 */

import { ConflictException } from "@common/exceptions/conflict.exception";

/**
 * 409 Conflict — an upload is already in progress for this user.
 *
 * The client should inform the user that their previous upload is still being
 * prepared and they should wait before starting a new one.
 */
export class UploadInProgressException extends ConflictException {
    constructor() {
        super(
            "upload-in-progress",
            "Upload Already In Progress",
            "An upload is already in progress for your account. Please wait for it to complete before starting a new one.",
        );
    }
}
