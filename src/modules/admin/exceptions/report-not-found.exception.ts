/**
 * @module modules/admin/exceptions/report-not-found.exception
 * @description
 * Thrown when a report cannot be found by the given ID.
 */

import { NotFoundException } from "@common/exceptions/not-found.exception";

/**
 * 404 - Report not found.
 */
export class ReportNotFoundException extends NotFoundException {
    constructor() {
        super(
            "report",
            "No report was found with the provided ID.",
        );
    }
}
