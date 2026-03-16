/**
 * Response DTO for POST /auth/refresh -> 200
 *
 * token_family stays the same across rotations - only the token value changes.
 * The client must replace its stored refresh_token with the new one immediately.
 */
export interface RefreshResponseDto {
    access_token: string;
    refresh_token: string;
    token_family: string;
    expires_in: number; // always 900 (seconds)
}
