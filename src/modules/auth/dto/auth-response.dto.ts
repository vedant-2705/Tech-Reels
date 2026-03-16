/**
 * Response DTO for:
 *   POST /auth/register        -> 201
 *   POST /auth/login           -> 200
 *   POST /auth/oauth/:provider -> 200 (existing) | 201 (new)
 *
 * Rules:
 * - Plain interface - no class-validator decorators needed on response DTOs.
 * - password_hash is NEVER included here.
 * - needs_onboarding is always false for email registration;
 *   true for new OAuth users who haven't selected topics yet.
 */
export interface AuthUserDto {
    id: string;
    email: string;
    username: string;
    avatar_url: string | null;
    role: string;
    experience_level: string;
    total_xp: number;
    token_balance: number;
    current_streak: number;
    created_at: string;
}

export interface AuthResponseDto {
    user: AuthUserDto;
    access_token: string;
    refresh_token: string;
    token_family: string;
    expires_in: number; // always 900 (seconds)
    needs_onboarding: boolean;
}
