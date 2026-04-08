import { XpAwardJobPayload } from "./gamification.interface";

export abstract class GamificationFacade {
    /**
     * Enqueues a job to award XP to a user.
     * @param payload Details of the XP award, including user ID, amount, and reason
     */
    abstract awardXp(payload: XpAwardJobPayload): Promise<void>;
}