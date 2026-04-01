/**
 * @module modules/admin/exceptions/admin-reel-not-found.exception
 * @description
 * Thrown when a reel cannot be found by the given ID in an admin context.
 * Distinct from ReelNotFoundException in ReelsModule - admin sees soft-deleted
 * rows and has different not-found semantics.
 */

import { NotFoundException } from "@common/exceptions/not-found.exception";

/**
 * 404 - Reel not found (admin context).
 */
export class AdminReelNotFoundException extends NotFoundException {
    constructor() {
        super(
            "reel",
            "No reel was found with the provided ID.",
        );
    }
}
