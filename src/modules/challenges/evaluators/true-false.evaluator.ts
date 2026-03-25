/**
 * @module modules/challenges/evaluators/true-false.evaluator
 * @description
 * Evaluator for TRUE_FALSE challenges.
 * Structurally identical to MCQ - the options array always has exactly
 * 2 items and correct_answer is a 0-indexed position string ('0' or '1').
 * Evaluation delegates to the same index-comparison logic as McqEvaluator.
 *
 * Self-registers with EvaluatorRegistry for type 'true_false'.
 */

import {
    IEvaluator,
    EvaluateInput,
    EvaluateResult,
} from "./ievaluator.interface";
import { EvaluatorRegistry } from "./evaluator.registry";
import { CHALLENGE_TYPE } from "../challenges.constants";

/**
 * Evaluates true/false challenge answers by comparing submitted
 * option index (0 or 1) against the stored correct option index.
 */
export class TrueFalseEvaluator implements IEvaluator {
    /**
     * @param input Challenge and submitted answer.
     * @returns Evaluation result - correct if submitted index matches correct index.
     */
    evaluate(input: EvaluateInput): EvaluateResult {
        const { challenge, submittedAnswer } = input;

        const submittedIndex = Number(submittedAnswer);
        const correctIndex = parseInt(challenge.correct_answer, 10);

        const is_correct =
            !Number.isNaN(submittedIndex) &&
            !Number.isNaN(correctIndex) &&
            submittedIndex === correctIndex;

        return { is_correct };
    }
}

// Self-register - runs once when this module is first imported.
EvaluatorRegistry.register(CHALLENGE_TYPE.TRUE_FALSE, TrueFalseEvaluator);
