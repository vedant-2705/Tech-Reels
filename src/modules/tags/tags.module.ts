/**
 * @module modules/tags/tags.module
 * @description
 * NestJS module wiring for the Tags catalogue feature.
 * DatabaseModule and RedisModule are @Global - not re-imported here.
 *
 * TagsRepository is exported so that other modules (Auth, Users) may
 * optionally import TagsModule and inject TagsRepository for tag
 * validation (e.g. validateTagIds during onboarding). Both modules
 * currently query the tags table directly via DatabaseService; centralising
 * via TagsRepository is a future refactor.
 *
 * Must be imported in AppModule.
 */

import { Module } from "@nestjs/common";
import { TagsController } from "./tags.controller";
import { TagsService } from "./tags.service.abstract";
import { TagsServiceImpl } from "./tags.service";
import { TagsRepository } from "./tags.repository";

/**
 * Registers tags controller, service, and repository.
 * Exports TagsRepository for optional use by Auth and Users modules.
 */
@Module({
    imports: [],
    controllers: [TagsController],
    providers: [
        { provide: TagsService, useClass: TagsServiceImpl },
        TagsRepository
    ],
    exports: [TagsRepository],
})
export class TagsModule {}
