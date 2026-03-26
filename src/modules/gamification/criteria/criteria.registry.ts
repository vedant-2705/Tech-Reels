/**
 * @module modules/gamification/criteria/criteria.registry
 * @description
 * Registry that maps badge criteria type strings to their evaluator instances.
 * Mirrors EvaluatorRegistry in the Challenges module.
 *
 * Adding a new criteria type:
 *   1. Create a class implementing ICriteria.
 *   2. Add an instance to the registry map below.
 *   3. Add the criteria shape to the BadgeCriteria discriminated union.
 *   No other changes required.
 */

import { ICriteria } from "./icriteria.interface";
import { ChallengeCorrectCountCriteria as _CCC } from "../entities/gamification.entity";
import { CriteriaType } from "../gamification.constants";

type CriteriaConstructor = new () => ICriteria;

/**
 * Singleton registry instance. Populated at module load time.
 */

/**
 * BadgeCriteriaRegistry provides static access to criteria evaluators.
 */
export class BadgeCriteriaRegistry {
    private static readonly registry = new Map<
        CriteriaType,
        CriteriaConstructor
    >();

    /**
     * Registers an evaluator constructor for a given challenge type.
     * Called by each evaluator file at module scope (self-registration).
     *
     * @param type    The challenge type this evaluator handles.
     * @param ctor    The evaluator constructor to register.
     */
    static register(type: CriteriaType, ctor: CriteriaConstructor): void {
        BadgeCriteriaRegistry.registry.set(type, ctor);
    }

    /**
     * Returns the evaluator for the given criteria type.
     * Throws if the type is not registered - indicates a missing evaluator
     * for a badge that exists in the DB.
     *
     * @param type Criteria type discriminant string.
     * @returns    Corresponding ICriteria evaluator.
     * @throws     Error if type is not registered.
     */
    static get(type: CriteriaType): ICriteria {
        const Ctor = BadgeCriteriaRegistry.registry.get(type);

        if (!Ctor) {
            throw new Error(
                `[BadgeCriteriaRegistry] No evaluator registered for criteria type "${type}". ` +
                    `Add an ICriteria implementation and register it in criteria.registry.ts.`,
            );
        }

        return new Ctor();
    }

    /**
     * Returns true if an evaluator is registered for the given type.
     * Use this to safely skip unknown criteria types rather than throwing.
     *
     * @param type Criteria type discriminant string.
     * @returns    true if registered.
     */
    static has(type: CriteriaType): boolean {
        return BadgeCriteriaRegistry.registry.has(type);
    }
}

// ---------------------------------------------------------------------------
// Self-registering imports
// Importing each file triggers its EvaluatorRegistry.register() side effect.
// Add one line here when adding a new criteria - nothing else changes.
// ---------------------------------------------------------------------------
import "./challenge-correct-count.criteria";
import "./accuracy-streak.criteria";
import "./topic-master.criteria";
