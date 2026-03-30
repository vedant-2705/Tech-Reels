/**
 * @module skill-paths/exceptions/already-enrolled.exception
 * @description
 * Thrown when a user attempts to enrol in a path they are already
 * actively enrolled in (status = in_progress).
 */

import { HttpStatus } from "@nestjs/common";
import { AppException } from "@common/exceptions/app.exception";

/**
 * 409 Conflict - user is already enrolled in this path with status 'in_progress'.
 */
export class AlreadyEnrolledException extends AppException {
    constructor() {
        super({
            type: "https://techreel.io/errors/already-enrolled",
            title: "Already Enrolled",
            status: HttpStatus.CONFLICT,
            detail: "You are already enrolled in this path",
        });
    }
}
