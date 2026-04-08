/**
 * @module modules/gamification/gamification.facade
 * @description
 * Facade for enqueuing gamification-related jobs, such as XP awards.
 */

import { Injectable } from "@nestjs/common";

import { MessagingService } from "@modules/messaging";
import { XpAwardJobPayload } from "./gamification.interface";
import { GAMIFICATION_MANIFEST } from "./gamification.messaging";
import { GamificationFacade } from "./gamification.facade.abstract";

/**
 * Facade for enqueuing XP award jobs.
 * Other modules call this instead of directly dispatching jobs,
 * to decouple from job name strings and internal queue details.
 */
@Injectable()
export class GamificationFacadeImpl extends GamificationFacade {
    constructor(private readonly messagingService: MessagingService) {
        super();
    }

    /** @inheritdoc */
    async awardXp(payload: XpAwardJobPayload): Promise<void> {
        // Enqueue via BullMQ internally
        return this.messagingService.dispatchJob(
            GAMIFICATION_MANIFEST.jobs.XP_AWARD.jobName,
            payload,
        );
    }
}