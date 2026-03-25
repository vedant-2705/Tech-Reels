/**
 * @module modules/challenges/evaluators/output-prediction.evaluator
 * @description
 * Evaluator for OUTPUT_PREDICTION challenges.
 * The user is shown a code snippet and asked to predict its output.
 *
 * Normalisation pipeline (applied to both submitted and correct answer):
 *   1. trim()                              - remove leading/trailing whitespace
 *   2. normalise line endings \r\n -> \n   - Windows vs Unix parity
 *   3. collapse 2+ blank lines -> \n       - cosmetic whitespace differences
 *   4. strip trailing newline              - console.log appends \n; user won't
 *   5. toLowerCase() if !case_sensitive    - optional, respects challenge setting
 *
 * NOTE: Type-level output parsing (e.g. '1' vs '1.0') is intentionally
 * out of scope. Challenge authors must set correct_answer to the exact
 * string the runtime produces. This is documented expected behaviour.
 *
 * Self-registers with EvaluatorRegistry for type 'output_prediction'.
 */

import {
    IEvaluator,
    EvaluateInput,
    EvaluateResult,
} from "./ievaluator.interface";
import { EvaluatorRegistry } from "./evaluator.registry";
import { CHALLENGE_TYPE } from "../challenges.constants";

/**
 * Evaluates output prediction answers with multi-step normalisation
 * to handle the most common sources of false negatives.
 */
export class OutputPredictionEvaluator implements IEvaluator {
    /**
     * Runs the full normalisation pipeline on a raw output string.
     *
     * @param value          Raw string value from user or DB.
     * @param caseSensitive  Whether to preserve casing.
     * @returns              Normalised string ready for comparison.
     */
    private normalize(value: string, caseSensitive: boolean): string {
        let result = value
            .trim() // step 1: trim outer whitespace
            .replace(/\r\n/g, "\n") // step 2: normalise line endings
            .replace(/\n{3,}/g, "\n\n") // step 3: collapse multiple blank lines
            .replace(/\n$/, ""); // step 4: strip trailing newline

        if (!caseSensitive) {
            result = result.toLowerCase(); // step 5: optional case folding
        }

        return result;
    }

    /**
     * @param input Challenge and submitted answer.
     * @returns Evaluation result - correct if normalised outputs match.
     */
    evaluate(input: EvaluateInput): EvaluateResult {
        const { challenge, submittedAnswer } = input;

        const submitted = this.normalize(
            String(submittedAnswer),
            challenge.case_sensitive,
        );
        const correct = this.normalize(
            challenge.correct_answer,
            challenge.case_sensitive,
        );

        return { is_correct: submitted === correct };
    }
}

// Self-register - runs once when this module is first imported.
EvaluatorRegistry.register(
    CHALLENGE_TYPE.OUTPUT_PREDICTION,
    OutputPredictionEvaluator,
);
