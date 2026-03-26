/**
 * @module modules/gamification/criteria/topic-master.criteria
 * @description
 * Evaluates the 'topic_master' badge criteria.
 *
 * STUB IMPLEMENTATION - always returns { met: false }.
 *
 * TODO: Implement when topic mastery definition is finalised.
 * Suggested implementation:
 *   1. Fetch user's affinity score for criteria.tagId from user_topic_affinity.
 *   2. Return met = true if score >= TOPIC_MASTER_AFFINITY_THRESHOLD (e.g. 50.0).
 *   3. This requires adding an affinity lookup to CriteriaEvaluationContext
 *      or passing the repository reference into evaluate().
 *
 * Badge codes for this type follow the pattern: topic_master_{tagId}.
 * They are created dynamically when tags are added (via TAG_CREATED event).
 */

import { ICriteria, CriteriaEvaluationResult } from "./icriteria.interface";
import {
    BadgeCriteria,
    CriteriaEvaluationContext,
} from "../entities/gamification.entity";
import { CRITERIA_TYPES } from "../gamification.constants";
import { BadgeCriteriaRegistry } from "./criteria.registry";

/**
 * Stub evaluator for topic_master criteria.
 * Returns false until the criteria logic is implemented.
 */
export class TopicMasterCriteria implements ICriteria {
    readonly type = CRITERIA_TYPES.TOPIC_MASTER;

    /**
     * @param _criteria Unused until implementation is complete.
     * @param _context  Unused until implementation is complete.
     * @returns         Always { met: false } until TODO is resolved.
     */
    evaluate(
        _criteria: BadgeCriteria,
        _context: CriteriaEvaluationContext,
    ): CriteriaEvaluationResult {
        // TODO: Implement topic master criteria evaluation.
        // See module docblock for implementation guidance.
        return { met: false };
    }
}

// Self-register - runs once when this module is first imported.
BadgeCriteriaRegistry.register(CRITERIA_TYPES.TOPIC_MASTER, TopicMasterCriteria);