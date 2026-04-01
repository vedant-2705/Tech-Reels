/**
 * @module modules/admin/admin.module
 * @description
 * NestJS module wiring together all Admin providers and cross-module imports.
 *
 * Imports:
 *   AuthModule - provides AuthSessionService for session revocation on
 *                suspend/ban. Pattern: same as how MediaModule imports ReelsModule.
 *
 * Queues:
 *   No BullMQ registration here - all queues are registered globally in
 *   QueuesModule (@Global). AdminService injects NOTIFICATION and XP_AWARD
 *   queues directly via @InjectQueue.
 *
 * Exports:
 *   None - Admin module has no services consumed by other modules.
 */

import { Module } from "@nestjs/common";

import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { AdminRepository } from "./admin.repository";

import { AuthModule } from "@modules/auth/auth.module";

/**
 * Registers Admin runtime dependencies and cross-module imports.
 */
@Module({
    imports: [
        /**
         * AuthModule exports AuthSessionService.
         * AdminService injects it for revokeAllSessions + incrementTokenVersion
         * on user suspend/ban.
         */
        AuthModule,
    ],
    controllers: [AdminController],
    providers: [AdminService, AdminRepository],
})
export class AdminModule {}
