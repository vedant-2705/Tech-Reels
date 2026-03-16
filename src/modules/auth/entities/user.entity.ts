/**
 * TypeScript interface for a row from the `users` table.
 *
 * Rules:
 * - This is a plain interface - no ORM decorators, no class-transformer.
 * - Field names match DB column names exactly (snake_case).
 * - Repository methods return this type; service maps it to response DTOs.
 * - password_hash is included here for internal use only -
 *   it is NEVER returned in any response DTO.
 */

export const USER_ROLES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const EXPERIENCE_LEVELS = ["novice", "intermediate", "advanced"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const ACCOUNT_STATUSES = [
    "active",
    "suspended",
    "banned",
    "deactivated",
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export interface User extends Record<string, unknown> {
    id: string;
    email: string;
    password_hash: string | null; // null for pure OAuth users
    username: string;
    avatar_url: string | null;
    bio: string | null;
    role: UserRole;
    experience_level: ExperienceLevel;
    account_status: AccountStatus;
    token_version: number;
    total_xp: number;
    token_balance: number;
    current_streak: number;
    longest_streak: number;
    last_active_date: string | null; // DATE returned as string YYYY-MM-DD
    public_profile_token: string | null;
    created_at: string; // TIMESTAMPTZ returned as ISO 8601 string
    updated_at: string;
    deleted_at: string | null;
}
