/**
 * @file scripts/seed-admin.ts
 * @description
 * Production admin seeder. Creates the initial admin user from environment
 * variables. Safe to run multiple times - uses ON CONFLICT DO UPDATE so
 * it will update an existing admin's password/username if re-run.
 *
 * Usage:
 *   npm run seed:admin
 *
 * Required env vars:
 *   ADMIN_EMAIL      - admin account email
 *   ADMIN_USERNAME   - admin account username
 *   ADMIN_PASSWORD   - plain text password (min 12 chars recommended)
 *
 * These must be set in .env (development) or as real environment variables
 * in production. Never hardcode them here.
 *
 * Security notes:
 *   - Password is hashed with bcrypt (12 rounds) before storage
 *   - Plain text password is never logged or stored
 *   - Script exits immediately after completion - no long-lived process
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as bcrypt from "bcrypt";
import { Pool } from "pg";
import { v7 as uuidv7 } from "uuid";

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, "../.env.development") });

//  Validate required env vars 

const REQUIRED = [
    "ADMIN_EMAIL",
    "ADMIN_USERNAME",
    "ADMIN_PASSWORD",
    "DB_HOST",
    "DB_PORT",
    "DB_NAME",
    "DB_USER",
    "DB_PASSWORD",
] as const;

const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length > 0) {
    console.error("Missing required environment variables:");
    missing.forEach((key) => console.error(`  - ${key}`));
    process.exit(1);
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME!;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD!;

//  Password strength check 

if (ADMIN_PASSWORD.length < 12) {
    console.error("ADMIN_PASSWORD must be at least 12 characters.");
    process.exit(1);
}

//  DB connection 

const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT ?? "5432", 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

//  Seed 

async function seedAdmin(): Promise<void> {
    console.log("Connecting to database...");
    const client = await pool.connect();

    try {
        console.log("Hashing password...");
        const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

        const id = uuidv7();

        console.log(`Seeding admin: ${ADMIN_EMAIL}`);

        const result = await client.query<{
            id: string;
            email: string;
            role: string;
        }>(
            `INSERT INTO users (
                id,
                email,
                username,
                password_hash,
                role,
                account_status,
                experience_level,
                created_at,
                updated_at
            )
            VALUES ($1, $2, $3, $4, 'admin', 'active', 'advanced', now(), now())
            ON CONFLICT (email) DO UPDATE
              SET username      = EXCLUDED.username,
                  password_hash = EXCLUDED.password_hash,
                  role          = 'admin',
                  account_status = 'active',
                  updated_at    = now()
            RETURNING id, email, role`,
            [id, ADMIN_EMAIL, ADMIN_USERNAME, passwordHash],
        );

        const admin = result.rows[0];

        console.log("");
        console.log("Admin seeded successfully:");
        console.log(`  ID:       ${admin.id}`);
        console.log(`  Email:    ${admin.email}`);
        console.log(`  Role:     ${admin.role}`);
        console.log(`  Username: ${ADMIN_USERNAME}`);
        console.log("");
        console.log(
            "Keep ADMIN_PASSWORD secret. Remove it from .env after seeding in production.",
        );
    } catch (err) {
        console.error("Seeding failed:", err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

seedAdmin();
