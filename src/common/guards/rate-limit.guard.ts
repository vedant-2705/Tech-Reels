/**
 * @module common/guards/rate-limit.guard
 * @description
 * Redis-based rate limiting guard.
 *
 * Why not @nestjs/throttler:
 *   - Throttler uses in-memory storage by default - resets on restart,
 *     does not work across multiple server instances in production.
 *   - Redis-based limiting is consistent, persistent, and horizontally scalable.
 *
 * Why not Nginx-only:
 *   - Nginx can limit by IP but has no concept of authenticated user identity.
 *   - User-scoped limits (e.g. "5 deactivations per hour per user") require
 *     knowing who the user is, which means running after JWT verification.
 *
 * Production setup:
 *   - Nginx handles IP-level DDoS protection (flood of unauthenticated requests)
 *   - This guard handles business-logic rate limits (user-scoped + IP-scoped)
 *
 * Usage - apply via @UseGuards with @SetRateLimit decorator:
 *
 *   @Post('deactivate')
 *   @SetRateLimit({ limit: 3, windowSeconds: 3600, scope: 'user' })
 *   @UseGuards(JwtAuthGuard, RateLimitGuard)
 *   async deactivate(@CurrentUser('userId') userId: string) { ... }
 *
 * Scope options:
 *   'user' - keyed by userId (requires authenticated request)
 *   'ip'   - keyed by caller IP (works on public endpoints)
 */

import {
    CanActivate,
    ExecutionContext,
    Injectable,
    SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { RedisService } from "../../redis/redis.service";
import { RateLimitException } from "../exceptions/rate-limit.exception";

//  Metadata key and decorator 

export const RATE_LIMIT_KEY = "rate_limit";

export interface RateLimitOptions {
    /** Maximum number of requests allowed in the window */
    limit: number;
    /** Window duration in seconds */
    windowSeconds: number;
    /** 'user' - scoped by userId | 'ip' - scoped by caller IP */
    scope: "user" | "ip";
    /**
     * Optional prefix for the Redis key.
     * Defaults to the route path if not provided.
     * Use this to share a limit across multiple endpoints.
     */
    keyPrefix?: string;
}

/**
 * Decorator to attach rate limit metadata to a route handler.
 *
 * @example
 * @SetRateLimit({ limit: 5, windowSeconds: 3600, scope: 'user' })
 */
export const SetRateLimit = (options: RateLimitOptions) =>
    SetMetadata(RATE_LIMIT_KEY, options);

//  Guard 

@Injectable()
export class RateLimitGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly redis: RedisService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const options = this.reflector.get<RateLimitOptions>(
            RATE_LIMIT_KEY,
            context.getHandler(),
        );

        // No @SetRateLimit on this handler - skip
        if (!options) return true;

        const request = context.switchToHttp().getRequest<
            Request & {
                user?: { userId?: string };
            }
        >();

        //  Determine the rate limit key identifier 
        let identifier: string;

        if (options.scope === "user") {
            const userId = request.user?.userId;
            if (!userId) {
                // No user on request - guard is misconfigured (should be after JwtAuthGuard)
                // Fail open rather than silently block all traffic
                return true;
            }
            identifier = `user:${userId}`;
        } else {
            const forwarded = request.headers["x-forwarded-for"];
            identifier = `ip:${
                (Array.isArray(forwarded)
                    ? forwarded[0]
                    : forwarded?.split(",")[0]
                )?.trim() ??
                request.socket.remoteAddress ??
                "0.0.0.0"
            }`;
        }

        //  Build Redis key 
        const prefix = options.keyPrefix ?? `${request.method}:${request.path}`;
        const redisKey = `rate_limit:${prefix}:${identifier}`;

        //  Increment and check 
        const current = await this.redis.incr(redisKey);

        if (current === 1) {
            // First request in this window - set TTL
            await this.redis.expire(redisKey, options.windowSeconds);
        }

        if (current > options.limit) {
            const retryAfter = await this.redis.ttl(redisKey);
            throw new RateLimitException(
                retryAfter > 0 ? retryAfter : options.windowSeconds,
            );
        }

        return true;
    }
}
