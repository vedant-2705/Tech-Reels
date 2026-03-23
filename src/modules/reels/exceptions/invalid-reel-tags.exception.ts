/**
 * @module modules/reels/exceptions/invalid-reel-tags.exception
 * @description
 * Thrown when one or more supplied tag UUIDs do not exist in the tags table
 * during reel creation or update.
 */

import { InvalidException } from "@common/exceptions/invalid.exception";

/**
 * 422 Unprocessable Entity - one or more tag_ids are not valid tag UUIDs.
 */
export class InvalidReelTagsException extends InvalidException {
    constructor() {
        super(
            "reel-tags",
            "Invalid Reel Tags",
            "One or more tag_ids do not exist",
        );
    }
}
