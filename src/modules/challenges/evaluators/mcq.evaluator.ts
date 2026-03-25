/**
 * @module modules/challenges/evaluators/mcq.evaluator
 * @description
 * Evaluator for MCQ (Multiple Choice Question) challenges.
 * Evaluation: submitted index (number) must equal the correct_answer index.
 * correct_answer is stored as a string in the DB ('0','1','2','3') and
 * parsed to number for comparison.
 *
 * Self-registers with EvaluatorRegistry for type 'mcq'.
 */

import {
    IEvaluator,
    EvaluateInput,
    EvaluateResult,
} from "./ievaluator.interface";
import { EvaluatorRegistry } from "./evaluator.registry";
import { CHALLENGE_TYPE } from "../challenges.constants";

/**
 * Evaluates multiple-choice challenge answers by comparing submitted
 * option index against the stored correct option index.
 */
export class McqEvaluator implements IEvaluator {
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
EvaluatorRegistry.register(CHALLENGE_TYPE.MCQ, McqEvaluator);
