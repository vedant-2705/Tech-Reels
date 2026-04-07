/**
 * @module modules/users/users.module
 * @description
 * Nest module wiring for the users feature. Imports AuthModule to access
 * AuthSessionService for session revocation during account deactivation,
 * and registers the FEED_BUILD BullMQ queue for feed rebuild side effects.
 */

import { Module } from "@nestjs/common";

import { AuthModule } from "@modules/auth/auth.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service.abstract";
import { UsersServiceImpl } from "./users.service";
import { UsersRepository } from "./users.repository";
import { MessagingModule } from "@modules/messaging";

/**
 * Registers all users-module dependencies.
 * AuthModule is imported to expose AuthSessionService - never AuthRepository.
 */
@Module({
    imports: [
        AuthModule,
        MessagingModule,
    ],
    controllers: [UsersController],
    providers: [
        { provide: UsersService, useClass: UsersServiceImpl },
        UsersRepository,
    ],
})
export class UsersModule {}
