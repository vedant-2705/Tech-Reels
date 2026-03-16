/**
 * @module modules/auth/auth.controller
 * @description
 * Controller exposing authentication endpoints for registration, login,
 * session refresh, logout, and authenticated profile lookup.
 */

import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Post,
    Req,
} from "@nestjs/common";
import type { Request } from "express";

import { AuthService } from "./auth.service";

import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { OAuthDto } from "./dto/oauth.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { LogoutDto } from "./dto/logout.dto";
import { AuthResponseDto } from "./dto/auth-response.dto";
import { RefreshResponseDto } from "./dto/refresh-response.dto";
import { MeResponseDto } from "./dto/me-response.dto";
import { MessageResponseDto } from "../../common/dto/message-response.dto";

import { SkipAuth } from "../../common/decorators/skip-auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";

/**
 * Thin transport layer for auth use cases.
 */
@Controller("auth")
export class AuthController {
    /**
     * @param authService Authentication application service.
     */
    constructor(private readonly authService: AuthService) {}

    /**
     * Register a new credential-based user account.
     *
     * @param dto Registration payload.
     * @returns Authentication response with user snapshot and tokens.
     */

    @Post("register")
    @SkipAuth()
    @HttpCode(HttpStatus.CREATED)
    async register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
        return this.authService.register(dto);
    }

    /**
     * Authenticate a user with email/password credentials.
     *
     * Resolves the caller IP from `X-Forwarded-For` when present so the
     * downstream service can apply rate-limiting rules correctly.
     *
     * @param dto Login payload.
     * @param req HTTP request used to extract caller IP.
     * @returns Authentication response with user snapshot and tokens.
     */

    @Post("login")
    @SkipAuth()
    @HttpCode(HttpStatus.OK)
    async login(
        @Body() dto: LoginDto,
        @Req() req: Request,
    ): Promise<AuthResponseDto> {
        // Extract real caller IP - respect X-Forwarded-For behind a proxy
        const forwarded = req.headers["x-forwarded-for"];
        const ip =
            (Array.isArray(forwarded)
                ? forwarded[0]
                : forwarded?.split(",")[0]
            )?.trim() ??
            req.socket.remoteAddress ??
            "0.0.0.0";

        return this.authService.login(dto, ip);
    }

    /**
     * Complete OAuth authentication for the selected provider.
     *
     * @param provider OAuth provider route parameter.
     * @param dto OAuth authorization-code payload.
     * @returns Authentication response with user snapshot and tokens.
     */

    @Post("oauth/:provider")
    @SkipAuth()
    @HttpCode(HttpStatus.OK)
    async oauthLogin(
        @Param("provider") provider: string,
        @Body() dto: OAuthDto,
    ): Promise<AuthResponseDto> {
        return this.authService.oauthLogin(provider, dto.code);
    }

    /**
     * Refresh an existing authenticated session.
     *
     * @param dto Refresh-token payload.
     * @returns Rotated token pair and expiry metadata.
     */

    @Post("refresh")
    @SkipAuth()
    @HttpCode(HttpStatus.OK)
    async refresh(@Body() dto: RefreshTokenDto): Promise<RefreshResponseDto> {
        return this.authService.refreshToken(dto);
    }

    /**
     * Revoke one authenticated session by token family.
     *
     * @param dto Logout payload.
     * @param userId Authenticated user identifier from JWT context.
     * @returns Success message.
     */

    @Post("logout")
    @HttpCode(HttpStatus.OK)
    async logout(
        @Body() dto: LogoutDto,
        @CurrentUser("userId") userId: string,
    ): Promise<MessageResponseDto> {
        return this.authService.logout(userId, dto.token_family);
    }

    /**
     * Revoke every active session for the authenticated user.
     *
     * @param userId Authenticated user identifier from JWT context.
     * @returns Success message.
     */

    @Post("logout-all")
    @HttpCode(HttpStatus.OK)
    async logoutAll(
        @CurrentUser("userId") userId: string,
    ): Promise<MessageResponseDto> {
        return this.authService.logoutAll(userId);
    }

    /**
     * Return the authenticated user's profile snapshot.
     *
     * @param userId Authenticated user identifier from JWT context.
     * @returns Current user profile data.
     */

    @Get("me")
    @HttpCode(HttpStatus.OK)
    async getMe(@CurrentUser("userId") userId: string): Promise<MeResponseDto> {
        return this.authService.getMe(userId);
    }
}
