/**
 * @module modules/challenges/evaluators/code-fill.evaluator
 * @description
 * Evaluator for CODE_FILL (Fill in the Blank) challenges.
 * Evaluation: trim both sides; compare case-insensitively unless
 * challenge.case_sensitive is explicitly true.
 *
 * Self-registers with EvaluatorRegistry for type 'code_fill'.
 */

import {
    IEvaluator,
    EvaluateInput,
    EvaluateResult,
} from "./ievaluator.interface";
import { EvaluatorRegistry } from "./evaluator.registry";
import { CHALLENGE_TYPE } from "../challenges.constants";

/**
 * Evaluates code fill-in-the-blank answers with optional case sensitivity.
 */
export class CodeFillEvaluator implements IEvaluator {
    /**
     * Normalises a string answer: always trims whitespace,
     * lowercases only when case_sensitive is false.
     *
     * @param value          Raw string value.
     * @param caseSensitive  Whether to preserve case.
     * @returns              Normalised string ready for comparison.
     */
    private normalize(value: string, caseSensitive: boolean): string {
        const trimmed = value.trim();
        return caseSensitive ? trimmed : trimmed.toLowerCase();
    }

    /**
     * @param input Challenge and submitted answer.
     * @returns Evaluation result - correct if normalised answers match.
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
EvaluatorRegistry.register(CHALLENGE_TYPE.CODE_FILL, CodeFillEvaluator);
