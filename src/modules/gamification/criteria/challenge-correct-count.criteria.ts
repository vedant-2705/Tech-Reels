/**
 * @module modules/gamification/criteria/challenge-correct-count.criteria
 * @description
 * Evaluates the 'challenge_correct_count' badge criteria.
 * Badge is awarded when the user's total correct challenge answers
 * reaches or exceeds the threshold defined in badges.criteria.
 *
 * Examples:
 *   first_correct    -> threshold: 1
 *   challenge_10     -> threshold: 10
 *   challenge_50     -> threshold: 50
 *   challenge_master -> threshold: 100
 */

import { ICriteria, CriteriaEvaluationResult } from "./icriteria.interface";
import {
    BadgeCriteria,
    CriteriaEvaluationContext,
    ChallengeCorrectCountCriteria as CriteriaShape,
} from "../entities/gamification.entity";
import { BadgeCriteriaRegistry } from "./criteria.registry";
import { CRITERIA_TYPES } from "../gamification.constants";

/**
 * Evaluates challenge_correct_count criteria.
 */
export class ChallengeCorrectCountCriteria implements ICriteria {
    readonly type = CRITERIA_TYPES.CHALLENGE_CORRECT_COUNT;

    /**
     * Checks whether totalCorrectCount >= criteria.threshold.
     *
     * @param criteria The badge's criteria config from DB.
     * @param context  Pre-fetched evaluation context.
     * @returns        { met: true } when threshold is reached.
     */
    evaluate(
        criteria: BadgeCriteria,
        context: CriteriaEvaluationContext,
    ): CriteriaEvaluationResult {
        const c = criteria as CriteriaShape;
        return { met: context.totalCorrectCount >= c.threshold };
    }
}

// Self-register - runs once when this module is first imported.
BadgeCriteriaRegistry.register(CRITERIA_TYPES.CHALLENGE_CORRECT_COUNT, ChallengeCorrectCountCriteria);