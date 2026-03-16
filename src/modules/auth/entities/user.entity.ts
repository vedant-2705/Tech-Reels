/**
 * @module modules/auth/entities/user.entity
 * @description
 * Auth domain entity types and enum-like constant sets representing rows
 * from the `users` table.
 */

/**
 * Supported application roles for user accounts.
 */
export const USER_ROLES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Supported experience levels collected during onboarding and registration.
 */
export const EXPERIENCE_LEVELS = ["novice", "intermediate", "advanced"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

/**
 * Supported lifecycle states for user accounts.
 */
export const ACCOUNT_STATUSES = [
    "active",
    "suspended",
    "banned",
    "deactivated",
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/**
 * Database-backed user entity returned by repository methods.
 */
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
