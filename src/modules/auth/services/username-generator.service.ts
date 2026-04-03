/**
 * @module modules/auth/services/username-generator.service
 * @description
 * Generates unique, sanitized usernames from display names.
 * Used during OAuth registration when user has no username.
 */

import { Injectable } from "@nestjs/common";
import { AuthRepository } from "../auth.repository";

/**
 * Produces unique, validated usernames from untrusted user input.
 */
@Injectable()
export class UsernameGeneratorService {
    constructor(private readonly authRepository: AuthRepository) {}

    /**
     * Generate a sanitized unique username candidate from a display name.
     * Strips special characters, converts to lowercase, replaces spaces with underscores.
     * Appends random 4-digit suffix if base name is taken.
     *
     * @param name Source display name (e.g., "John Doe" from OAuth profile).
     * @returns Unique username string ready for persistence.
     *
     * @example
     * "John Doe" -> "john_doe" (if available) or "john_doe_4521" (if taken)
     */
    async generateUnique(name: string): Promise<string> {
        // Sanitise: lowercase, spaces -> underscore, remove special chars
        const base = name
            .toLowerCase()
            .replace(/\s+/g, "_")
            .replace(/[^a-z0-9_]/g, "")
            .slice(0, 46); // leave room for _XXXX suffix

        let attempt = base || "user";

        // Loop until we find a unique username
        while (await this.authRepository.existsByUsername(attempt)) {
            const suffix = Math.floor(1000 + Math.random() * 9000); // 4-digit number
            attempt = `${base}_${suffix}`;
        }

        return attempt;
    }
}
