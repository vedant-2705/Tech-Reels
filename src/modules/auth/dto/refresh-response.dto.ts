/**
 * @module modules/auth/dto/refresh-response.dto
 * @description
 * Response DTO returned after a successful refresh-token rotation.
 */

/**
 * Token rotation response containing the new access/refresh token pair.
 */
export interface RefreshResponseDto {
    access_token: string;
    refresh_token: string;
    token_family: string;
    expires_in: number; // always 900 (seconds)
}
