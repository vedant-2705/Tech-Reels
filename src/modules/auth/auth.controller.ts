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
import {
    ApiBearerAuth,
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from "@nestjs/swagger";
import { ApiErrorDto } from "@common/dto/api-error.dto";
import { EXPERIENCE_LEVELS } from "./entities/user.entity";

/**
 * Thin transport layer for auth use cases.
 */

@ApiTags("Auth")
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
    @ApiOperation({
        summary: "Register a new account",
        description:
            "Creates a new user account with email + password. " +
            "Seeds topic affinity scores for the selected tags. " +
            "Queues a welcome email and initial feed build.",
    })
    @ApiResponse({
        status: 201,
        description: "Account created successfully.",
        type: AuthResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: "Validation failed.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 409,
        description: "Email or username already in use.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 422,
        description: "One or more topic IDs do not exist.",
        type: ApiErrorDto,
    })
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
    @ApiOperation({
        summary: "Login with email and password",
        description:
            "Authenticates with email + password. " +
            "Rate-limited to 5 failed attempts per IP+email within 15 minutes. " +
            "Returns access token (15 min) and refresh token (30 days).",
    })
    @ApiResponse({
        status: 200,
        description: "Login successful.",
        type: AuthResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: "Validation failed.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 401,
        description: "Invalid credentials.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 403,
        description: "Account not active (suspended / banned / deactivated).",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 429,
        description: "Too many failed login attempts.",
        type: ApiErrorDto,
    })
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
    @ApiOperation({
        summary: "Login or register with OAuth",
        description:
            "Exchange a provider authorization code for TechReel tokens. " +
            "If the account does not exist it is created automatically (`needs_onboarding: true`). " +
            "If the email matches an existing password account, the OAuth provider is linked. " +
            "The provider access token is used once to fetch the profile, then discarded - never stored.",
    })
    @ApiParam({
        name: "provider",
        enum: EXPERIENCE_LEVELS,
        description: "OAuth provider.",
        example: "google",
    })
    @ApiResponse({
        status: 200,
        description: "Login successful (existing user).",
        type: AuthResponseDto,
    })
    @ApiResponse({
        status: 200,
        description:
            "Registration successful (new user). `needs_onboarding` will be true.",
        type: AuthResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: "Validation failed or invalid provider.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 401,
        description: "Provider rejected the authorization code.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 403,
        description: "Account not active.",
        type: ApiErrorDto,
    })
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
    @ApiOperation({
        summary: "Rotate refresh token",
        description:
            "Issues a new access token and rotates the refresh token. " +
            "The previous refresh token is immediately invalidated. " +
            "Replaying an already-rotated token triggers reuse detection - all sessions are terminated.",
    })
    @ApiResponse({
        status: 200,
        description: "Token rotated successfully.",
        type: RefreshResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: "Validation failed.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 401,
        description: "Session expired or token reuse detected.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 403,
        description: "Account not active.",
        type: ApiErrorDto,
    })
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
    @ApiBearerAuth("access-token")
    @ApiOperation({
        summary: "Logout current session",
        description:
            "Terminates the session identified by `token_family`. " +
            "Other active sessions on other devices remain valid.",
    })
    @ApiResponse({
        status: 200,
        description: "Logged out successfully.",
        type: MessageResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: "Validation failed.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized - invalid or expired token.",
        type: ApiErrorDto,
    })
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
    @ApiBearerAuth("access-token")
    @ApiOperation({
        summary: "Logout all sessions",
        description:
            "Terminates every active session for the authenticated user across all devices. " +
            "Increments `token_version` - all existing JWTs become invalid within 60 seconds.",
    })
    @ApiResponse({
        status: 200,
        description: "All sessions terminated.",
        type: MessageResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
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
    @ApiBearerAuth("access-token")
    @ApiOperation({
        summary: "Get current user profile",
        description:
            "Returns the full profile of the currently authenticated user.",
    })
    @ApiResponse({
        status: 200,
        description: "Profile returned.",
        type: MeResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized - invalid, expired, or revoked token.",
        type: ApiErrorDto,
    })
    async getMe(@CurrentUser("userId") userId: string): Promise<MeResponseDto> {
        return this.authService.getMe(userId);
    }
}
