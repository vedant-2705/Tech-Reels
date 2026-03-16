/**
 * @module database/database.module
 * @description
 * Global Nest module that provides shared database access services.
 */

import { Global, Module } from "@nestjs/common";
import { DatabaseService } from "./database.service";

/**
 * Registers and exports DatabaseService for application-wide usage.
 */
@Global()
@Module({
    providers: [DatabaseService],
    exports: [DatabaseService],
})
export class DatabaseModule {}
