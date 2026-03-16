/**
 * @module modules/auth/strategies/jwt.strategy
 * @description
 * Passport JWT strategy that validates signed access tokens and enforces
 * token-version based server-side session invalidation.
 */

import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { DatabaseService } from "@database/database.service";
import { RedisService } from "@redis/redis.service";
import {
    AUTH_ERRORS,
    AUTH_JWT,
    AUTH_REDIS_KEYS,
} from "../auth.constants";

/**
 * JWT claims expected in signed access tokens.
 */
export interface JwtPayload {
    sub: string; // userId (UUID v7)
    role: string; // 'user' | 'admin'
    username: string;
    tokenVersion: number;
    iat: number;
    exp: number;
}

/**
 * Authenticated user object attached to `request.user`.
 */
export interface JwtUser {
    userId: string;
    role: string;
    username: string;
}

/**
 * Validates bearer tokens and resolves authenticated request user context.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    /**
     * @param config Runtime configuration provider.
     * @param redis Redis cache used for token-version reads.
     * @param db Database service fallback for cache misses.
     */
    constructor(
        private readonly config: ConfigService,
        private readonly redis: RedisService,
        private readonly db: DatabaseService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            // RS256 - verify with the public key only (private key never leaves the signer)
            secretOrKey: config.get<string>(AUTH_JWT.PUBLIC_KEY_ENV) as string,
            algorithms: [AUTH_JWT.ALGORITHM],
        });
    }

    /**
     * Called by Passport after signature + expiry are verified.
     * We additionally enforce tokenVersion so logout-all invalidates
     * all existing JWTs within 60 seconds (the Redis TTL).
     *
     * The returned object becomes request.user.
     */
    async validate(payload: JwtPayload): Promise<JwtUser> {
        let storedVersion: number;

        // Try Redis cache first (TTL 60s) - avoids DB hit on every request
        const cached = await this.redis.get(
            `${AUTH_REDIS_KEYS.TOKEN_VERSION_PREFIX}:${payload.sub}`,
        );

        if (cached !== null) {
            storedVersion = parseInt(cached, 10);
        } else {
            // Cache miss - load from DB and repopulate cache
            const result = await this.db.query<{ token_version: number }>(
                "SELECT token_version FROM users WHERE id = $1 AND deleted_at IS NULL",
                [payload.sub],
            );

            if (!result.rows[0]) {
                throw new UnauthorizedException();
            }

            storedVersion = result.rows[0].token_version;

            // Cache for 60s - maximum enforcement delay after logout-all
            await this.redis.set(
                `${AUTH_REDIS_KEYS.TOKEN_VERSION_PREFIX}:${payload.sub}`,
                String(storedVersion),
                60,
            );
        }

        // Compare JWT tokenVersion against stored version
        if (payload.tokenVersion !== storedVersion) {
            throw new UnauthorizedException(AUTH_ERRORS.SESSION_INVALIDATED);
        }

        return {
            userId: payload.sub,
            role: payload.role,
            username: payload.username,
        };
    }
}
