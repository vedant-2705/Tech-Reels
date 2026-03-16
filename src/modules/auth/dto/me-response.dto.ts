/**
 * @module modules/auth/dto/me-response.dto
 * @description
 * Response DTO returned by the authenticated profile endpoint.
 */

/**
 * Detailed authenticated user profile payload for `GET /auth/me`.
 */
export interface MeResponseDto {
    id: string;
    email: string;
    username: string;
    avatar_url: string | null;
    bio: string | null;
    role: string;
    experience_level: string;
    account_status: string;
    total_xp: number;
    token_balance: number;
    current_streak: number;
    longest_streak: number;
    last_active_date: string | null; // YYYY-MM-DD
    public_profile_token: string | null;
    created_at: string; // ISO 8601
}
