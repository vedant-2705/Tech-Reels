/**
 * @module modules/tags/exceptions/tag-not-found.exception
 * @description
 * Thrown when a tag lookup by ID returns no result.
 * Produces an RFC 7807 404 response with type:
 * https://techreel.io/errors/tag-not-found
 */

import { NotFoundException } from "@common/exceptions/not-found.exception";

/**
 * Raised by TagsService when findById returns null.
 *
 * HTTP 404 - type: https://techreel.io/errors/tag-not-found
 */
export class TagNotFoundException extends NotFoundException {
    constructor() {
        super("tag", "No tag found with this ID");
    }
}
