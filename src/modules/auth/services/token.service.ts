/**
 * @module modules/auth/services/token.service
 * @description
 * JWT token lifecycle management - generation, rotation, and verification.
 * Handles both access tokens (RS256, 15min) and refresh tokens (HS256, 30days).
 */

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { AuthRepository } from "../auth.repository";
import { User } from "../entities/user.entity";
import { hashValue, compareHash } from "@common/utils/hash.util";
import { uuidv7 } from "@common/utils/uuidv7.util";
import {
    AUTH_BCRYPT_ROUNDS,
    AUTH_JWT,
    AUTH_TTL,
} from "../auth.constants";

interface TokenPair {
    access_token: string;
    refresh_token: string;
    token_family: string;
}

/**
 * Manages JWT token generation, rotation, and verification.
 * Centralizes all token lifecycle logic.
 */
@Injectable()
export class TokenService {
    constructor(
        private readonly jwtService: JwtService,
        private readonly config: ConfigService,
        private readonly authRepository: AuthRepository,
    ) {}

    /**
     * Generate a new access/refresh token pair and persist refresh hash.
     *
     * @param user Authenticated user entity.
     * @returns Signed access token, refresh token, and token-family ID.
     */
    async generatePair(user: User): Promise<TokenPair> {
        // 1. Sign access token - RS256, 15 min
        const access_token = this.jwtService.sign(
            {
                sub: user.id,
                role: user.role,
                username: user.username,
                tokenVersion: user.token_version,
            },
            {
                privateKey: this.config.get<string>(AUTH_JWT.PRIVATE_KEY_ENV),
                algorithm: AUTH_JWT.ALGORITHM,
                expiresIn: parseInt(
                    this.config.get<string>(AUTH_JWT.ACCESS_TTL_ENV) ??
                        AUTH_TTL.ACCESS_TOKEN_SECONDS,
                    10,
                ),
            },
        );

        // 2. Generate new token family UUID
        const token_family = uuidv7();

        // 3. Sign refresh token - HS256, 30 days
        const refresh_token = this.jwtService.sign(
            { sub: user.id, family: token_family },
            {
                secret: this.config.get<string>(AUTH_JWT.REFRESH_SECRET_ENV),
                algorithm: AUTH_JWT.REFRESH_ALGORITHM,
                expiresIn: parseInt(
                    this.config.get<string>(AUTH_JWT.REFRESH_TTL_ENV) ??
                        AUTH_TTL.REFRESH_TOKEN_SECONDS,
                    10,
                ),
            },
        );

        // 4. Hash the raw refresh token before storing - cost 10 (tokens, not passwords)
        const hash = await hashValue(
            refresh_token,
            AUTH_BCRYPT_ROUNDS.TOKEN,
        );

        // 5. Store hash in Redis with 30-day TTL
        await this.authRepository.storeRefreshToken(
            user.id,
            token_family,
            hash,
        );

        return { access_token, refresh_token, token_family };
    }

    /**
     * Generate a new access token for an existing token family.
     * Used during refresh token rotation.
     *
     * @param user Authenticated user entity.
     * @param tokenFamily Existing token family UUID.
     * @returns Signed access token.
     */
    async generateAccessToken(user: User): Promise<string> {
        return this.jwtService.sign(
            {
                sub: user.id,
                role: user.role,
                username: user.username,
                tokenVersion: user.token_version,
            },
            {
                privateKey: this.config.get<string>(AUTH_JWT.PRIVATE_KEY_ENV),
                algorithm: AUTH_JWT.ALGORITHM,
                expiresIn: parseInt(
                    this.config.get<string>(AUTH_JWT.ACCESS_TTL_ENV) ??
                        AUTH_TTL.ACCESS_TOKEN_SECONDS,
                    10,
                ),
            },
        );
    }

    /**
     * Generate a new refresh token for token rotation.
     * The new token is signed and hashed, ready to store.
     *
     * @param userId User UUID.
     * @param tokenFamily Existing token family UUID.
     * @returns Raw refresh token (caller must hash before persisting).
     */
    async generateRefreshToken(
        userId: string,
        tokenFamily: string,
    ): Promise<string> {
        return this.jwtService.sign(
            { sub: userId, family: tokenFamily },
            {
                secret: this.config.get<string>(AUTH_JWT.REFRESH_SECRET_ENV),
                algorithm: AUTH_JWT.REFRESH_ALGORITHM,
                expiresIn: parseInt(
                    this.config.get<string>(AUTH_JWT.REFRESH_TTL_ENV) ??
                        AUTH_TTL.REFRESH_TOKEN_SECONDS,
                    10,
                ),
            },
        );
    }

    /**
     * Verify a refresh token signature + expiry and extract its payload.
     * @param token Raw refresh token string from client.
     * @returns payload with userId and tokenFamily if valid, or null if invalid/expired.
     */
    async verifyRefreshToken(
        token: string,
    ): Promise<{ userId: string; tokenFamily: string } | null> {
        try {
            const payload = this.jwtService.verify<{ sub: string; family: string }>(token, {
                secret: this.config.get<string>(AUTH_JWT.REFRESH_SECRET_ENV),
                algorithms: [AUTH_JWT.REFRESH_ALGORITHM],
            });
            return { 
                userId: payload.sub, 
                tokenFamily: payload.family 
            };
        } catch (e) {
            return null;
        }
    }

    /**
     * Rotate a refresh token - invalidate old, store new hash.
     *
     * @param userId User UUID.
     * @param tokenFamily Existing token family UUID.
     * @param newRefreshToken New raw refresh token.
     */
    async rotateAndStore(
        userId: string,
        tokenFamily: string,
        newRefreshToken: string,
    ): Promise<void> {
        const newHash = await hashValue(
            newRefreshToken,
            AUTH_BCRYPT_ROUNDS.TOKEN,
        );
        await this.authRepository.rotateRefreshToken(
            userId,
            tokenFamily,
            newHash,
        );
    }

    /**
     * Verify a refresh token against its stored hash.
     *
     * @param rawToken Raw refresh token string.
     * @param storedHash Bcrypt hash from Redis.
     * @returns true if token matches stored hash.
     */
    async verifyRefreshTokenHash(
        rawToken: string,
        storedHash: string,
    ): Promise<boolean> {
        return compareHash(rawToken, storedHash);
    }

    /**
     * Get the access token expiry in seconds.
     *
     * @returns TTL in seconds.
     */
    getAccessTokenTtl(): number {
        return parseInt(
            this.config.get<string>(AUTH_JWT.ACCESS_TTL_ENV) ??
                AUTH_TTL.ACCESS_TOKEN_SECONDS,
            10,
        );
    }
}
