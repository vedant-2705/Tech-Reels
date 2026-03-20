/**
 * @module modules/tags/exceptions/tag-conflict.exception
 * @description
 * Thrown when a tag creation or update would produce a duplicate name.
 * Produces an RFC 7807 409 response with type:
 * https://techreel.io/errors/tag-conflict
 */

import { ConflictException } from "@common/exceptions/conflict.exception";

/**
 * Raised by TagsService when a tag name already exists in the catalogue.
 * On POST: triggered if the name is already taken by any tag.
 * On PATCH: triggered only if the name is taken by a *different* tag
 * (ownership-aware check - admin patching with the current name is allowed).
 *
 * HTTP 409 - type: https://techreel.io/errors/tag-conflict
 */
export class TagConflictException extends ConflictException {
    constructor() {
        super(
            "tag",
            "Tag Already Exists",
            "A tag with this name already exists",
        );
    }
}
