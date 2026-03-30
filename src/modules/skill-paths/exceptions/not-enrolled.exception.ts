/**
 * @module skill-paths/exceptions/not-enrolled.exception
 * @description
 * Thrown when a user attempts to access progress or unenrol from a path
 * they are not currently enrolled in.
 *
 * HTTP 404 - the resource (their enrolment) does not exist.
 */

import { HttpStatus } from "@nestjs/common";
import { AppException } from "@common/exceptions/app.exception";

/**
 * 404 Not Found - user is not enrolled in this path, so no enrolment resource exists for them to access or delete.
 */
export class NotEnrolledException extends AppException {
    constructor() {
        super({
            type: "https://techreel.io/errors/not-enrolled",
            title: "Not Enrolled",
            status: HttpStatus.NOT_FOUND,
            detail: "You are not enrolled in this path",
        });
    }
}
