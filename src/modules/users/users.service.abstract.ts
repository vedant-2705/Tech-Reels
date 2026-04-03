/**
 * @module modules/users/users.service.abstract
 * @description
 * Abstract class contract for the users application service.
 *
 * Controllers and any cross-module consumers depend on this abstract
 * class.  DI is wired in UsersModule so `UsersService` (token) resolves
 * to `UsersServiceImpl` (concrete class).
 */

import { UpdateProfileDto } from "./dto/update-profile.dto";
import { CompleteOnboardingDto } from "./dto/complete-onboarding.dto";
import { AvatarUploadDto } from "./dto/avatar-upload.dto";
import { ConfirmAvatarDto } from "./dto/confirm-avatar.dto";
import { DeactivateDto } from "./dto/deactivate.dto";

import { ProfileResponseDto } from "./dto/profile-response.dto";
import { UpdateProfileResponseDto } from "./dto/update-profile-response.dto";
import { OnboardingResponseDto } from "./dto/onboarding-response.dto";
import { AvatarUploadResponseDto } from "./dto/avatar-upload-response.dto";
import { ConfirmAvatarResponseDto } from "./dto/confirm-avatar-response.dto";
import { XpHistoryResponseDto } from "./dto/xp-history-response.dto";
import { BadgesResponseDto } from "./dto/badges-response.dto";
import { StatsResponseDto } from "./dto/stats-response.dto";
import { PublicProfileResponseDto } from "./dto/public-profile-response.dto";
import { UsernameCheckResponseDto } from "./dto/username-check-response.dto";
import { LeaderboardResponseDto } from "./dto/leaderboard-response.dto";
import { MessageResponseDto } from "@common/dto/message-response.dto";

export abstract class UsersService {
    /** Return the authenticated user's own profile. */
    abstract getMyProfile(userId: string): Promise<ProfileResponseDto>;

    /**
     * Check whether a username is available for the authenticated user to
     * take. Returns available: true when the username is free OR when it
     * already belongs to the requesting user.
     */
    abstract checkUsername(
        userId: string,
        username: string,
    ): Promise<UsernameCheckResponseDto>;

    /** Update mutable profile fields. */
    abstract updateProfile(
        userId: string,
        dto: UpdateProfileDto,
    ): Promise<UpdateProfileResponseDto>;

    /** Complete the post-OAuth onboarding step. */
    abstract completeOnboarding(
        userId: string,
        dto: CompleteOnboardingDto,
    ): Promise<OnboardingResponseDto>;

    /** Request a presigned S3 URL for avatar upload. */
    abstract getAvatarUploadUrl(
        userId: string,
        dto: AvatarUploadDto,
    ): Promise<AvatarUploadResponseDto>;

    /** Confirm an avatar upload and persist the CDN URL. */
    abstract confirmAvatar(
        userId: string,
        dto: ConfirmAvatarDto,
    ): Promise<ConfirmAvatarResponseDto>;

    /** Soft-deactivate the authenticated user's account. */
    abstract deactivateAccount(
        userId: string,
        dto: DeactivateDto,
    ): Promise<MessageResponseDto>;

    /** Return paginated XP ledger entries for the user. */
    abstract getXpHistory(
        userId: string,
        cursor: string | undefined,
        limit: number,
    ): Promise<XpHistoryResponseDto>;

    /** Return all awarded badges for the user. */
    abstract getBadges(userId: string): Promise<BadgesResponseDto>;

    /** Return aggregated gamification stats for the user. */
    abstract getStats(userId: string): Promise<StatsResponseDto>;

    /** Return the leaderboard, optionally filtered by tag. */
    abstract getLeaderboard(
        userId: string,
        tagId: string | undefined,
        limit: number,
    ): Promise<LeaderboardResponseDto>;

    /** Generate and persist a new public profile token. */
    abstract generatePublicToken(userId: string): Promise<{
        public_profile_token: string;
        public_profile_url: string;
    }>;

    /** Revoke the active public profile token. */
    abstract revokePublicToken(userId: string): Promise<MessageResponseDto>;

    /** Return the public profile for a username. */
    abstract getPublicProfile(
        username: string,
    ): Promise<PublicProfileResponseDto>;

    /** Return the recruiter-facing profile for a public token. */
    abstract getProfileByToken(
        token: string,
    ): Promise<PublicProfileResponseDto>;
}
