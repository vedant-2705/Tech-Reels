/**
 * @module modules/auth/auth-session.service
 * @description
 * Thin service that exposes session-lifecycle operations (revocation,
 * token-version management) for consumption by other modules.
 */

import { Injectable } from "@nestjs/common";
import { AuthRepository } from "./auth.repository";

@Injectable()
export class AuthSessionService {
    constructor(private readonly authRepository: AuthRepository) {}

    /**
     * Deletes all refresh token keys for the given user from Redis.
     *
     * @param userId - The authenticated user's UUID.
     */
    async revokeAllSessions(userId: string): Promise<void> {
        await this.authRepository.revokeAllSessions(userId);
    }

    /**
     * Increments token_version in the DB and evicts the Redis cache entry.
     * All existing access tokens for this user become invalid within 60 seconds.
     *
     * @param userId - The authenticated user's UUID.
     */
    async incrementTokenVersion(userId: string): Promise<void> {
        await this.authRepository.incrementTokenVersion(userId);
    }
}
