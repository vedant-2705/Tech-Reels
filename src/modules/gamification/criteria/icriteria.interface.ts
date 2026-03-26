/**
 * @module modules/gamification/criteria/icriteria.interface
 * @description
 * Interface that every badge criteria evaluator must implement.
 * Mirrors the IEvaluator pattern used in the Challenges module.
 */

import {
    BadgeCriteria,
    CriteriaEvaluationContext,
} from "../entities/gamification.entity";

/**
 * Result returned by a criteria evaluator.
 */
export interface CriteriaEvaluationResult {
    /** true if the user meets this badge's criteria. */
    met: boolean;
}

/**
 * Every badge criteria type must implement this interface.
 * The `type` property must match the discriminant in BadgeCriteria.
 */
export interface ICriteria {
    /** Criteria type discriminant - matches BadgeCriteria.type. */
    readonly type: BadgeCriteria["type"];

    /**
     * Evaluates whether the user meets this badge's criteria.
     *
     * @param criteria The criteria config from the badges table.
     * @param context  Pre-fetched evaluation context (counts, recent attempts).
     * @returns        { met: boolean }
     */
    evaluate(
        criteria: BadgeCriteria,
        context: CriteriaEvaluationContext,
    ): CriteriaEvaluationResult;
}
