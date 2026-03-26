/**
 * @module modules/gamification/criteria/accuracy-streak.criteria
 * @description
 * Evaluates the 'accuracy_streak' badge criteria.
 * Badge is awarded when the user has N consecutive correct challenge
 * answers without any incorrect attempt in between.
 *
 * Examples:
 *   accuracy_streak_5  -> threshold: 5
 *   accuracy_streak_20 -> threshold: 20
 *
 * recentAttempts in context is ordered oldest-first and pre-fetched
 * to the maximum threshold needed across all accuracy_streak badges.
 * The evaluator counts the tail streak (most-recent consecutive corrects).
 */

import { ICriteria, CriteriaEvaluationResult } from "./icriteria.interface";
import {
    BadgeCriteria,
    CriteriaEvaluationContext,
    AccuracyStreakCriteria as CriteriaShape,
} from "../entities/gamification.entity";
import { CRITERIA_TYPES } from "../gamification.constants";
import { BadgeCriteriaRegistry } from "./criteria.registry";

/**
 * Evaluates accuracy_streak criteria.
 */
export class AccuracyStreakCriteria implements ICriteria {
    readonly type = CRITERIA_TYPES.ACCURACY_STREAK;

    /**
     * Counts consecutive correct answers from the end of recentAttempts.
     * Returns met = true if the tail streak >= criteria.threshold.
     *
     * @param criteria The badge's criteria config from DB.
     * @param context  Pre-fetched evaluation context with recentAttempts.
     * @returns        { met: boolean }
     */
    evaluate(
        criteria: BadgeCriteria,
        context: CriteriaEvaluationContext,
    ): CriteriaEvaluationResult {
        const c = criteria as CriteriaShape;
        const attempts = context.recentAttempts;

        if (attempts.length === 0) return { met: false };

        // Count consecutive correct answers from the most-recent end
        let streak = 0;
        for (let i = attempts.length - 1; i >= 0; i--) {
            if (attempts[i].is_correct) {
                streak++;
            } else {
                break;
            }
        }

        return { met: streak >= c.threshold };
    }
}

// Self-register - runs once when this module is first imported.
BadgeCriteriaRegistry.register(CRITERIA_TYPES.ACCURACY_STREAK, AccuracyStreakCriteria);