/**
 * @module modules/auth/dto/auth-response.dto
 * @description
 * Response DTOs returned by authentication endpoints after successful
 * registration, login, or OAuth authentication.
 */

/**
 * Public user snapshot included in authentication responses.
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

/**
 * Authentication response envelope containing user data and issued tokens.
 */
export interface AuthResponseDto {
    user: AuthUserDto;
    access_token: string;
    refresh_token: string;
    token_family: string;
    expires_in: number; // always 900 (seconds)
    needs_onboarding: boolean;
}
