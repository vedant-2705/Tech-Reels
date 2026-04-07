/**
 * @module modules/challenges/challenges.module
 * @description
 * NestJS module wiring for the Challenges feature.
 *
 * BullMQ queues registered here:
 *   - xp_award_queue         -> jobs produced by submitAttempt on correct answers
 *   - badge_evaluation_queue -> jobs produced by submitAttempt on correct answers
 *
 * Global modules (no explicit import needed):
 *   DatabaseModule, RedisModule, QueuesModule - registered @Global in AppModule.
 *
 * Evaluators (McqEvaluator, TrueFalseEvaluator, CodeFillEvaluator,
 * OutputPredictionEvaluator) are plain TypeScript classes - NOT NestJS
 * providers. They self-register with EvaluatorRegistry at module scope via
 * the import chain: ChallengesService -> EvaluatorRegistry -> evaluator files.
 * No registration in the providers array is required or correct.
 */

import { Module } from "@nestjs/common";

import { ChallengesController } from "./challenges.controller";
import { ChallengesService } from "./challenges.service.abstract";
import { ChallengesServiceImpl } from "./challenges.service";
import { ChallengesRepository } from "./challenges.repository";
import { OptionsValidatorService } from "./services/options-validator.service";
import { MessagingModule } from "@modules/messaging";

@Module({
    imports: [MessagingModule],
    controllers: [ChallengesController],
    providers: [
        { provide: ChallengesService, useClass: ChallengesServiceImpl },
        OptionsValidatorService,
        ChallengesRepository,
    ],
})
export class ChallengesModule {}
