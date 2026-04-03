/**
 * @module modules/auth/auth.service.abstract
 * @description
 * Abstract class contract for the authentication service.
 *
 * Consumers (controllers, guards, other services) depend on this
 * abstract class rather than the concrete implementation.  NestJS DI
 * is wired in the module so that injecting `AuthService` (the token)
 * resolves to `AuthServiceImpl` (the concrete class).
 *
 * Naming convention: `<module>.service.abstract.ts` for the contract,
 * `<module>.service.ts` for the concrete implementation.
 */

import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { AuthResponseDto } from "./dto/auth-response.dto";
import { RefreshResponseDto } from "./dto/refresh-response.dto";
import { MeResponseDto } from "./dto/me-response.dto";
import { MessageResponseDto } from "@common/dto/message-response.dto";

export abstract class AuthService {
    /**
     * Register a new user with email/password credentials.
     *
     * @param dto Registration payload.
     * @returns Authentication response with user snapshot and tokens.
     */
    abstract register(dto: RegisterDto): Promise<AuthResponseDto>;

    /**
     * Authenticate a credential-based user.
     *
     * @param dto Login payload.
     * @param ip Caller IP address used for rate limiting.
     * @returns Authentication response with user snapshot and tokens.
     */
    abstract login(dto: LoginDto, ip: string): Promise<AuthResponseDto>;

    /**
     * Authenticate a user via OAuth authorization code flow.
     *
     * @param provider OAuth provider identifier.
     * @param code Provider authorization code.
     * @returns Authentication response with user snapshot and tokens.
     */
    abstract oauthLogin(
        provider: string,
        code: string,
    ): Promise<AuthResponseDto>;

    /**
     * Refresh an authenticated session by rotating the refresh token.
     *
     * @param dto Refresh-token payload.
     * @returns Rotated access/refresh token pair.
     */
    abstract refreshToken(dto: RefreshTokenDto): Promise<RefreshResponseDto>;

    /**
     * Revoke one authenticated session by token family.
     *
     * @param userId Authenticated user UUID.
     * @param tokenFamily Token-family UUID.
     * @returns Success message.
     */
    abstract logout(
        userId: string,
        tokenFamily: string,
    ): Promise<MessageResponseDto>;

    /**
     * Revoke every active session for the authenticated user.
     *
     * @param userId Authenticated user UUID.
     * @returns Success message.
     */
    abstract logoutAll(userId: string): Promise<MessageResponseDto>;

    /**
     * Retrieve the authenticated user's profile payload.
     *
     * @param userId Authenticated user UUID.
     * @returns Detailed authenticated user profile.
     */
    abstract getMe(userId: string): Promise<MeResponseDto>;
}
