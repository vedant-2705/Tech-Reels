/**
 * @module modules/challenges/evaluators/evaluator.registry
 * @description
 * Central registry that maps challenge types to their evaluator constructors.
 * Implements the Registry pattern so the service has zero knowledge of
 * concrete evaluator classes - it only calls EvaluatorRegistry.get(type).
 *
 * Open/Closed: this file never changes when a new evaluator is added.
 * Each evaluator self-registers by calling EvaluatorRegistry.register()
 * at module scope, then is imported once below to trigger that side effect.
 *
 * Adding a new evaluator (zero changes to service or registry logic):
 *   1. Create your-evaluator.ts implementing IEvaluator
 *   2. Call EvaluatorRegistry.register('your_type', YourEvaluator) at bottom of that file
 *   3. Add one import line in the "Self-registering imports" block below
 */

import { IEvaluator } from "./ievaluator.interface";
import { ChallengeType } from "../challenges.constants";

/** Constructor type for any IEvaluator implementation. */
type EvaluatorConstructor = new () => IEvaluator;

/**
 * Singleton registry mapping ChallengeType -> evaluator constructor.
 * The registry stores constructors, not instances - a fresh instance is
 * created per evaluation call to keep evaluators stateless and thread-safe.
 */
export class EvaluatorRegistry {
    private static readonly registry = new Map<
        ChallengeType,
        EvaluatorConstructor
    >();

    /**
     * Registers an evaluator constructor for a given challenge type.
     * Called by each evaluator file at module scope (self-registration).
     *
     * @param type    The challenge type this evaluator handles.
     * @param ctor    The evaluator constructor to register.
     */
    static register(type: ChallengeType, ctor: EvaluatorConstructor): void {
        EvaluatorRegistry.registry.set(type, ctor);
    }

    /**
     * Returns a fresh evaluator instance for the given challenge type.
     *
     * @param type The challenge type to evaluate.
     * @returns    A new instance of the registered evaluator.
     * @throws     Error if no evaluator is registered for the given type.
     */
    static get(type: ChallengeType): IEvaluator {
        const Ctor = EvaluatorRegistry.registry.get(type);

        if (!Ctor) {
            throw new Error(
                `[EvaluatorRegistry] No evaluator registered for challenge type: "${type}". ` +
                `Register one via EvaluatorRegistry.register('${type}', YourEvaluator) ` +
                `and import the file in evaluator.registry.ts.`,
            );
        }

        return new Ctor();
    }

    /**
     * Returns true if an evaluator is registered for the given type.
     * Useful for guards and validation logic.
     *
     * @param type The challenge type to check.
     */
    static has(type: ChallengeType): boolean {
        return EvaluatorRegistry.registry.has(type);
    }
}

// ---------------------------------------------------------------------------
// Self-registering evaluator imports
// Importing each file triggers its EvaluatorRegistry.register() side effect.
// Add one line here when adding a new evaluator - nothing else changes.
// ---------------------------------------------------------------------------
import "./mcq.evaluator";
import "./true-false.evaluator";
import "./code-fill.evaluator";
import "./output-prediction.evaluator";
