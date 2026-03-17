/**
 * @module config/database.config
 * @description
 * Database configuration namespace for PostgreSQL connection parameters.
 */

import { registerAs } from "@nestjs/config";

/**
 * Database configuration factory registered under the `database` namespace.
 */
export default registerAs("database", () => ({
    host: process.env.DB_HOST ?? "localhost",
    port: parseInt(process.env.DB_PORT ?? "5432", 10),
    name: process.env.DB_NAME ?? "techreel",
    user: process.env.DB_USER ?? "postgres",
    password: process.env.DB_PASSWORD ?? "",
}));
