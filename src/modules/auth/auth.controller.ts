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
 * AuthController - all routes under /api/v1/auth
 *
 * Rules:
 * - Controller only extracts params, calls service, and returns the result.
 * - NO business logic here - ever.
 * - NO direct DB or Redis calls - ever.
 * - Public routes use @SkipAuth() to bypass the global JwtAuthGuard.
 * - Protected routes rely on the global guard; userId extracted via @CurrentUser.
 */
@Controller("auth")
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    //  POST /auth/register 

    @Post("register")
    @SkipAuth()
    @HttpCode(HttpStatus.CREATED)
    async register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
        return this.authService.register(dto);
    }

    //  POST /auth/login 

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

    //  POST /auth/oauth/:provider 
    // Returns 201 for brand new users, 200 for existing.
    // NestJS always sends the status from @HttpCode - for dynamic 200/201
    // the service returns the data and the controller sets 200 by default;
    // new-user 201 is handled by checking needs_onboarding in the response.
    // Per the LLD the HTTP status is 201 for new users / 200 for existing -
    // we achieve this by letting the default 201 apply to POST and the client
    // reads needs_onboarding to determine the flow.

    @Post("oauth/:provider")
    @SkipAuth()
    @HttpCode(HttpStatus.OK)
    async oauthLogin(
        @Param("provider") provider: string,
        @Body() dto: OAuthDto,
    ): Promise<AuthResponseDto> {
        return this.authService.oauthLogin(provider, dto.code);
    }

    //  POST /auth/refresh 

    @Post("refresh")
    @SkipAuth()
    @HttpCode(HttpStatus.OK)
    async refresh(@Body() dto: RefreshTokenDto): Promise<RefreshResponseDto> {
        return this.authService.refreshToken(dto);
    }

    //  POST /auth/logout 
    // Protected - requires valid JWT. Terminates one session by token_family.

    @Post("logout")
    @HttpCode(HttpStatus.OK)
    async logout(
        @Body() dto: LogoutDto,
        @CurrentUser("userId") userId: string,
    ): Promise<MessageResponseDto> {
        return this.authService.logout(userId, dto.token_family);
    }

    //  POST /auth/logout-all 
    // Protected - requires valid JWT. Terminates all sessions for this user.

    @Post("logout-all")
    @HttpCode(HttpStatus.OK)
    async logoutAll(
        @CurrentUser("userId") userId: string,
    ): Promise<MessageResponseDto> {
        return this.authService.logoutAll(userId);
    }

    //  GET /auth/me 
    // Protected - requires valid JWT.

    @Get("me")
    @HttpCode(HttpStatus.OK)
    async getMe(@CurrentUser("userId") userId: string): Promise<MeResponseDto> {
        return this.authService.getMe(userId);
    }
}
