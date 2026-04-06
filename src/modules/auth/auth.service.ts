/**
 * @module modules/auth/auth.service
 * @description
 * Authentication application service implementing registration, credential
 * login, OAuth login, token refresh, logout, and profile retrieval flows.
 */

import { Injectable, UnauthorizedException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";

import { AuthService } from "./auth.service.abstract";
import { AuthRepository } from "./auth.repository";
import { OAuthService } from "./strategies/oauth.strategy";
import { TokenService } from "./services/token.service";
import { UsernameGeneratorService } from "./services/username-generator.service";
import { AccountStatus, User } from "./entities/user.entity";

import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { AuthResponseDto } from "./dto/auth-response.dto";
import { RefreshResponseDto } from "./dto/refresh-response.dto";
import { MeResponseDto } from "./dto/me-response.dto";
import { MessageResponseDto } from "@common/dto/message-response.dto";

import { UsernameConflictException } from "@common/exceptions/username-conflict.exception";
import { InvalidTopicsException } from "@common/exceptions/invalid-topics.exception";
import { InvalidCredentialsException } from "@common/exceptions/invalid-credentials.exception";
import { AccountNotActiveException } from "@common/exceptions/account-not-active.exception";

import { EmailConflictException } from "@modules/auth/exceptions/email-conflict.exception";
import { TooManyAttemptsException } from "@modules/auth/exceptions/too-many-attempts.exception";
import { SessionExpiredException } from "@modules/auth/exceptions/session-expired.exception";
import { TokenReuseException } from "@modules/auth/exceptions/token-reuse.exception";
import { InvalidProviderException } from "@modules/auth/exceptions/invalid-provider.exception";

import { QUEUES } from "@queues/queue-names";
import { RedisService } from "@redis/redis.service";

import {
    compareHash,
    DUMMY_HASH,
    hashValue,
} from "@common/utils/hash.util";
import {
    UserLoggedInEvent,
    UserLoggedOutEvent,
} from "./events/user-registered.event";
import {
    AUTH_BCRYPT_ROUNDS,
    AUTH_MESSAGES,
    AUTH_MODULE_CONSTANTS,
    AUTH_OAUTH,
    AUTH_QUEUE_JOBS,
} from "./auth.constants";
import { USERS_ACCOUNT_STATUS } from "@common/constants/shared.constants";
import { MessagingService } from "@modules/messaging";
import { use } from "passport";

type InactiveAccountStatus = Exclude<AccountStatus, "active">;

/**
 * Coordinates auth workflows, side effects, and token lifecycle management.
 */
@Injectable()
export class AuthServiceImpl extends AuthService {
    /**
     * @param authRepository Auth persistence and cache repository.
     * @param oauthService OAuth integration service.
     * @param tokenService JWT token lifecycle service.
     * @param usernameGeneratorService Username generation service.
     * @param jwtService JWT signing and verification service.
     * @param config Runtime configuration provider.
     * @param redis Redis pub/sub client.
     * @param notificationQueue Queue for notification jobs.
     * @param feedBuildQueue Queue for feed bootstrap jobs.
     */
    constructor(
        private readonly authRepository: AuthRepository,
        private readonly oauthService: OAuthService,
        private readonly tokenService: TokenService,
        private readonly usernameGeneratorService: UsernameGeneratorService,
        private readonly redis: RedisService,
       private readonly messagingService: MessagingService,
    ) {
        super();
    }

    /** @inheritdoc */
    async register(dto: RegisterDto): Promise<AuthResponseDto> {
        // 1. Check email uniqueness
        if (await this.authRepository.existsByEmail(dto.email)) {
            throw new EmailConflictException();
        }

        // 2. Check username uniqueness
        if (await this.authRepository.existsByUsername(dto.username)) {
            throw new UsernameConflictException();
        }

        // 3. Validate topic UUIDs exist in tags table
        const validIds = await this.authRepository.validateTagIds(dto.topics);
        if (validIds.length !== dto.topics.length) {
            throw new InvalidTopicsException();
        }

        // 4. Hash password - cost 12 for passwords
        const password_hash = await hashValue(
            dto.password,
            AUTH_BCRYPT_ROUNDS.PASSWORD,
        );

        // 5. Create user row + seed user_topic_affinity in one transaction
        const user = await this.authRepository.createUserWithAffinity({
            email: dto.email,
            password_hash,
            username: dto.username,
            experience_level: dto.experience_level,
            topics: dto.topics,
        });

        // 6. Generate token pair
        const tokens = await this.tokenService.generatePair(user);

        // 7. Async side effects - fire and forget (don't await, don't block response)
        void this.messagingService.dispatchJob(
            AUTH_QUEUE_JOBS.WELCOME_EMAIL, 
            { userId: user.id }
        );
        void this.messagingService.dispatchJob(
            AUTH_QUEUE_JOBS.NEW_USER, 
            { 
                userId: user.id,
                reason: AUTH_QUEUE_JOBS.NEW_USER,
            }
        );

        // 8. Return response
        return this.buildAuthResponse(user, tokens, false);
    }

    /** @inheritdoc */
    async login(dto: LoginDto, ip: string): Promise<AuthResponseDto> {
        // 1. Check login rate limit (5 failures / 15 min / IP+email)
        const attempts = await this.authRepository.getLoginAttempts(
            ip,
            dto.email,
        );
        if (attempts >= 5) {
            const retryAfter = await this.authRepository.getLoginAttemptsTtl(
                ip,
                dto.email,
            );
            throw new TooManyAttemptsException(
                retryAfter > 0 ? retryAfter : 900,
            );
        }

        // 2. Look up user by email
        const user = await this.authRepository.findByEmail(dto.email);

        if (!user) {
            // Timing attack prevention - always run bcrypt even on miss
            await compareHash(dto.password, DUMMY_HASH);
            await this.authRepository.incrementLoginAttempts(ip, dto.email);
            throw new InvalidCredentialsException();
        }

        // 3. Check account status before verifying password
        if (user.account_status !== USERS_ACCOUNT_STATUS.ACTIVE) {
            throw new AccountNotActiveException(
                user.account_status as InactiveAccountStatus,
            );
        }

        // 4. Verify password
        const passwordValid = await compareHash(
            dto.password,
            user.password_hash ?? DUMMY_HASH,
        );

        if (!passwordValid) {
            await this.authRepository.incrementLoginAttempts(ip, dto.email);
            throw new InvalidCredentialsException();
        }

        // 5. Success - clear failed attempt counter
        await this.authRepository.clearLoginAttempts(ip, dto.email);

        // 6. Generate token pair
        const tokens = await this.tokenService.generatePair(user);

        // 7. Publish login event to Pub/Sub
        void this.messagingService.dispatchEvent(
            AUTH_MODULE_CONSTANTS.USER_LOGGED_IN,
            { userId: user.id },
        );

        // 8. Return response
        return this.buildAuthResponse(user, tokens, false);
    }

    /** @inheritdoc */
    async oauthLogin(provider: string, code: string): Promise<AuthResponseDto> {
        // 1. Validate provider
        if (
            provider !== AUTH_OAUTH.PROVIDERS.GOOGLE &&
            provider !== AUTH_OAUTH.PROVIDERS.GITHUB
        ) {
            throw new InvalidProviderException();
        }

        // 2. Exchange authorization code for profile (provider token discarded after)
        const profile = await this.oauthService.exchangeCode(provider, code);

        let user: User | null = null;
        let needsOnboarding = false;

        // 3. Try to find existing OAuth account
        user = await this.authRepository.findByOAuthProvider(
            provider,
            profile.provider_user_id,
        );

        if (!user) {
            // 4. Try to find existing user by email (link accounts)
            const existingUser = await this.authRepository.findByEmail(
                profile.email,
            );

            if (existingUser) {
                // 4a. Check account status before linking
                if (
                    existingUser.account_status !== USERS_ACCOUNT_STATUS.ACTIVE
                ) {
                    throw new AccountNotActiveException(
                        existingUser.account_status as InactiveAccountStatus,
                    );
                }
                // 4b. Link OAuth provider to existing account
                await this.authRepository.linkOAuthAccount({
                    userId: existingUser.id,
                    provider,
                    provider_user_id: profile.provider_user_id,
                });
                user = existingUser;
            } else {
                // 5. Neither found - create new user
                const username =
                    await this.usernameGeneratorService.generateUnique(
                        profile.name,
                    );

                user = await this.authRepository.createOAuthUser({
                    email: profile.email,
                    username,
                    avatar_url: profile.avatar_url,
                    provider,
                    provider_user_id: profile.provider_user_id,
                });

                needsOnboarding = true;

                // Async side effects for new users
                void this.messagingService.dispatchJob(
                    AUTH_QUEUE_JOBS.WELCOME_EMAIL,
                    { userId: user.id }
                );
            }
        }

        // 6. Check account status of the resolved user
        if (user.account_status !== USERS_ACCOUNT_STATUS.ACTIVE) {
            throw new AccountNotActiveException(
                user.account_status as InactiveAccountStatus,
            );
        }

        // 7. Generate token pair
        const tokens = await this.tokenService.generatePair(user);

        // 8. Publish login event
        void this.messagingService.dispatchEvent(
            AUTH_MODULE_CONSTANTS.USER_LOGGED_IN,
            { userId: user.id },
        );

        // 9. Return response with needs_onboarding flag
        return this.buildAuthResponse(user, tokens, needsOnboarding);
    }

    /** @inheritdoc */
    async refreshToken(dto: RefreshTokenDto): Promise<RefreshResponseDto> {
        // 1. Verify refresh token signature and expiry (HS256)
        const tokenPayload = await this.tokenService.verifyRefreshToken(
            dto.refresh_token,
        );
        if (!tokenPayload) {
            throw new SessionExpiredException();
        }

        const { userId, tokenFamily } = tokenPayload;

        // Validate token_family from body matches the one in the JWT
        if (tokenFamily !== dto.token_family) {
            await this.authRepository.revokeAllSessions(userId);
            throw new TokenReuseException();
        }

        // 2. Get stored hash - if missing, the token was already rotated or expired
        const storedHash = await this.authRepository.getRefreshTokenHash(
            userId,
            tokenFamily,
        );

        if (storedHash === null) {
            // Token family exists but hash is gone - replay attack
            await this.authRepository.revokeAllSessions(userId);
            throw new TokenReuseException();
        }

        // 3. Verify raw token matches the stored hash
        const hashValid = await compareHash(dto.refresh_token, storedHash);
        if (!hashValid) {
            await this.authRepository.revokeAllSessions(userId);
            throw new TokenReuseException();
        }

        // 4. Reload user and check account status
        const user = await this.authRepository.findById(userId);
        if (!user) {
            throw new SessionExpiredException();
        }
        if (user.account_status !== USERS_ACCOUNT_STATUS.ACTIVE) {
            throw new AccountNotActiveException(
                user.account_status as InactiveAccountStatus,
            );
        }

        // 5. Rotate refresh token - old key deleted, new value stored under same family
        const newRefreshToken = await this.tokenService.generateRefreshToken(
            userId,
            tokenFamily,
        );

        await this.tokenService.rotateAndStore(
            userId,
            tokenFamily,
            newRefreshToken,
        );

        // 6 & 7. Sign new access token
        const newAccessToken =
            await this.tokenService.generateAccessToken(user);

        return {
            access_token: newAccessToken,
            refresh_token: newRefreshToken,
            token_family: tokenFamily,
            expires_in: this.tokenService.getAccessTokenTtl(),
        };
    }

    /** @inheritdoc */
    async logout(
        userId: string,
        tokenFamily: string,
    ): Promise<MessageResponseDto> {
        // Idempotent - no error if token family doesn't exist
        await this.authRepository.deleteRefreshToken(userId, tokenFamily);

        void this.messagingService.dispatchEvent(
            AUTH_MODULE_CONSTANTS.USER_LOGGED_OUT,
            { userId },
        );

        return { message: AUTH_MESSAGES.LOGGED_OUT };
    }

    /**
     * Revoke every active session for the authenticated user.
     *
     * @param userId Authenticated user UUID.
     * @returns Success message.
     */

    async logoutAll(userId: string): Promise<MessageResponseDto> {
        // 1. Revoke every refresh token for this user
        await this.authRepository.revokeAllSessions(userId);

        // 2. Increment token_version in DB + bust Redis cache
        //    All existing JWTs will fail tokenVersion check within 60s
        await this.authRepository.incrementTokenVersion(userId);

        return { message: AUTH_MESSAGES.ALL_SESSIONS_TERMINATED };
    }

    /** @inheritdoc */
    async getMe(userId: string): Promise<MeResponseDto> {
        const user = await this.authRepository.findById(userId);

        if (!user) {
            throw new UnauthorizedException();
        }

        return {
            id: user.id,
            email: user.email,
            username: user.username,
            avatar_url: user.avatar_url,
            bio: user.bio,
            role: user.role,
            experience_level: user.experience_level,
            account_status: user.account_status,
            total_xp: user.total_xp,
            token_balance: user.token_balance,
            current_streak: user.current_streak,
            longest_streak: user.longest_streak,
            last_active_date: user.last_active_date,
            public_profile_token: user.public_profile_token,
            created_at: user.created_at,
        };
    }

    /**
     * Map user and token data into the public auth response envelope.
     *
     * @param user Authenticated user entity.
     * @param tokens Generated token pair.
     * @param needsOnboarding Whether the client should continue onboarding.
     * @returns API-facing authentication response DTO.
     */
    private buildAuthResponse(
        user: User,
        tokens: {
            access_token: string;
            refresh_token: string;
            token_family: string;
        },
        needsOnboarding: boolean,
    ): AuthResponseDto {
        return {
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                avatar_url: user.avatar_url,
                role: user.role,
                experience_level: user.experience_level,
                total_xp: user.total_xp,
                token_balance: user.token_balance,
                current_streak: user.current_streak,
                created_at: user.created_at,
            },
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            token_family: tokens.token_family,
            expires_in: this.tokenService.getAccessTokenTtl(),
            needs_onboarding: needsOnboarding,
        };
    }
}
