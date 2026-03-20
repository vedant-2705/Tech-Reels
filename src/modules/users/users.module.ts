/**
 * @module modules/users/users.module
 * @description
 * Nest module wiring for the users feature. Imports AuthModule to access
 * AuthSessionService for session revocation during account deactivation,
 * and registers the FEED_BUILD BullMQ queue for feed rebuild side effects.
 */

import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";

import { AuthModule } from "@modules/auth/auth.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { UsersRepository } from "./users.repository";
import { QUEUES } from "@queues/queue-names";

/**
 * Registers all users-module dependencies.
 * AuthModule is imported to expose AuthSessionService — never AuthRepository.
 */
@Module({
    imports: [
        AuthModule,
        BullModule.registerQueue({ name: QUEUES.FEED_BUILD }),
    ],
    controllers: [UsersController],
    providers: [UsersService, UsersRepository],
})
export class UsersModule {}
