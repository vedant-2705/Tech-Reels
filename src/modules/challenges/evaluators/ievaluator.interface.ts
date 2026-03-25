/**
 * @module modules/challenges/evaluators/ievaluator.interface
 * @description
 * Strategy contract that every challenge evaluator must implement.
 * Evaluators are plain TypeScript classes - NOT NestJS injectable providers.
 * They are instantiated by the EvaluatorRegistry, never registered in any
 * NestJS providers array.
 *
 * To add a new evaluator:
 *   1. Create a class implementing IEvaluator
 *   2. Call EvaluatorRegistry.register(type, YourEvaluator) at module scope
 *   3. Import the file once in evaluator.registry.ts to trigger registration
 *   Service, registry, and this interface require zero changes.
 */

import { Challenge } from "../entities/challenge.entity";

/**
 * Input passed to every evaluator's evaluate() method.
 * The evaluator must not mutate the challenge object.
 */
export interface EvaluateInput {
    /** The full challenge row from the database, including correct_answer. */
    challenge: Challenge;

    /** The raw answer submitted by the user (number for index-based, string for text-based). */
    submittedAnswer: string | number;
}

/**
 * Result returned by every evaluator's evaluate() method.
 */
export interface EvaluateResult {
    /** Whether the submitted answer is correct. */
    is_correct: boolean;
}

/**
 * Strategy interface that all challenge evaluators must implement.
 */
export interface IEvaluator {
    /**
     * Evaluates a submitted answer against the challenge's correct answer.
     *
     * @param input The challenge and submitted answer.
     * @returns Evaluation result indicating correctness.
     */
    evaluate(input: EvaluateInput): EvaluateResult;
}
