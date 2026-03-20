/**
 * @module modules/users/users.mapper
 * @description
 * Pure mapping functions that translate domain entities and raw repository
 * results into response DTOs. No dependencies, no side effects - import
 * and call directly from the service.
 *
 * Centralising mappings here keeps the service focused on orchestration
 * and makes shape changes easy to find and update in one place.
 */

import { User } from "../auth/entities/user.entity";
import { BadgeEntry, TopTopic } from "./users.repository";

import { ProfileResponseDto } from "./dto/profile-response.dto";
import {
    PublicProfileResponseDto,
    PublicBadgeDto,
} from "./dto/public-profile-response.dto";

// ---------------------------------------------------------------------------
// Badge shape helpers
// ---------------------------------------------------------------------------

/**
 * Map a BadgeEntry to the minimal public badge shape used on the
 * username-based public profile (code, name, icon_url only).
 *
 * @param badge Full badge entry from the repository.
 * @returns Minimal public badge DTO.
 */
export function toPublicBadge(badge: BadgeEntry): PublicBadgeDto {
    return {
        code: badge.code,
        name: badge.name,
        icon_url: badge.icon_url,
    };
}

/**
 * Map a BadgeEntry to the recruiter badge shape used on the token-based
 * profile (adds description and earned_at).
 *
 * @param badge Full badge entry from the repository.
 * @returns Recruiter-facing badge DTO.
 */
export function toRecruiterBadge(badge: BadgeEntry): PublicBadgeDto {
    return {
        code: badge.code,
        name: badge.name,
        description: badge.description,
        icon_url: badge.icon_url,
        earned_at: badge.earned_at,
    };
}

// ---------------------------------------------------------------------------
// Authenticated profile
// ---------------------------------------------------------------------------

/**
 * Map a User entity and its linked OAuth providers into the full
 * authenticated profile response DTO.
 *
 * @param user Full user entity from the repository.
 * @param linked_providers Array of linked OAuth provider names.
 * @returns Authenticated profile response DTO.
 */
export function toProfileResponseDto(
    user: User,
    linked_providers: string[],
): ProfileResponseDto {
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
        has_password: user.password_hash !== null,
        linked_providers,
        created_at: user.created_at,
    };
}

// ---------------------------------------------------------------------------
// Public profile - shared base between username and token views
// ---------------------------------------------------------------------------

/**
 * Map a User entity, pre-mapped badge array, and reel count into the
 * shared base fields of the public profile response DTO. Both
 * getPublicProfile (username) and getProfileByToken (token) build on
 * this base - each then adds its own extra fields.
 *
 * @param user Partial user entity from the repository.
 * @param badges Already-mapped badge DTOs (public or recruiter shape).
 * @param reels_count Count of active published reels.
 * @returns Base public profile DTO (without recruiter-only fields).
 */
export function toPublicProfileBase(
    user: User,
    badges: PublicBadgeDto[],
    reels_count: number,
): PublicProfileResponseDto {
    return {
        username: user.username,
        avatar_url: user.avatar_url,
        bio: user.bio,
        experience_level: user.experience_level,
        total_xp: user.total_xp,
        current_streak: user.current_streak,
        longest_streak: user.longest_streak,
        badges,
        reels_count,
        joined_at: user.created_at,
    };
}

// ---------------------------------------------------------------------------
// Username availability check
// ---------------------------------------------------------------------------

/**
 * Shape returned by the username availability check endpoint.
 */
export interface UsernameCheckResult {
    username: string;
    available: boolean;
}
