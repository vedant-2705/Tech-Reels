/**
 * @module skill-paths/exceptions/path-not-found.exception
 * @description
 * Thrown when a skill path does not exist (deleted or never created),
 * or when a published-only endpoint is accessed for an unpublished path.
 */

import { NotFoundException } from "@common/exceptions/not-found.exception";

/**
 * 404 Not Found - no skill path exists with the given ID (or it is not published when accessed via a published-only endpoint).
 */
export class PathNotFoundException extends NotFoundException {
    constructor() {
        super(
            "path",
            "No skill path found with this ID",
        );
    }
}
