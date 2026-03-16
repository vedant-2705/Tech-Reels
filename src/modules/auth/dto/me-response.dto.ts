/**
 * Response DTO for GET /auth/me -> 200
 *
 * Richer than AuthUserDto - includes bio, account_status,
 * streak details, last_active_date, and public_profile_token.
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
