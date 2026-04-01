/**
 * @module modules/admin/exceptions/max-challenges.exception
 * @description
 * Thrown when an admin attempts to add a challenge to a reel that already
 * has the maximum allowed number of active (non-deleted) challenges.
 */

import { HttpStatus } from "@nestjs/common";
import { AppException } from "@common/exceptions/app.exception";
import { MAX_CHALLENGES_PER_REEL } from "../admin.constants";

/**
 * 409 - Reel has reached the maximum number of challenges.
 */
export class MaxChallengesException extends AppException {
    constructor() {
        super({
            type: "https://techreel.io/errors/max-challenges",
            title: "Maximum Challenges Reached",
            status: HttpStatus.CONFLICT,
            detail: `A reel cannot have more than ${MAX_CHALLENGES_PER_REEL} active challenges.`,
        });
    }
}
