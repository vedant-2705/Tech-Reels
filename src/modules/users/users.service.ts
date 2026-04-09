/**
 * @module modules/users/users.service
 * @description
 * Application service for the users module. Implements all 14 use cases:
 * profile retrieval, profile update, username availability check, OAuth
 * onboarding, avatar upload and confirmation, account deactivation, XP
 * history, badges, gamification stats, and public profile token management.
 *
 * Shape translation is handled by users.mapper.ts - this service focuses
 * purely on orchestration and business rules.
 */

import { Injectable, UnauthorizedException } from "@nestjs/common";
import * as crypto from "crypto";

import { UsersService } from "./users.service.abstract";
import { UsersRepository } from "./users.repository";
import { AuthSessionService } from "../auth/auth-session.service";
import { S3Service } from "@s3/s3.service";
import { RedisService } from "@redis/redis.service";

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
import { MessageResponseDto } from "@common/dto/message-response.dto";

import { UsernameConflictException } from "@common/exceptions/username-conflict.exception";
import { InvalidTopicsException } from "@common/exceptions/invalid-topics.exception";
import { InvalidCredentialsException } from "@common/exceptions/invalid-credentials.exception";
import { UserNotFoundException } from "./exceptions/user-not-found.exception";
import { ProfileNotFoundException } from "./exceptions/profile-not-found.exception";
import { InvalidAvatarKeyException } from "./exceptions/invalid-avatar-key.exception";

import { compareHash } from "@common/utils/hash.util";
import {
    USERS_ACCOUNT_STATUSES,
    USERS_MESSAGES,
    USERS_REDIS_KEYS,
} from "./users.constants";
import {
    toProfileResponseDto,
    toPublicBadge,
    toPublicProfileBase,
    toRecruiterBadge,
} from "./users.mapper";

import { buildAvatarKey } from "./utils/build-avatar-key.util";
import { ConfigService } from "@nestjs/config";
import { LeaderboardResponseDto } from "./dto/leaderboard-response.dto";
import { MessagingService } from "@modules/messaging";
import { USERS_MANIFEST } from "./users.messaging";
import { UserAccountDeactivatedEventPayload } from "./users.interface";
import { FeedFacade } from "@modules/feed";

/**
 * Coordinates all user profile use cases, side effects, and cross-module
 * operations such as session revocation via AuthSessionService.
 */
@Injectable()
export class UsersServiceImpl extends UsersService {
    /**
     * @param usersRepository Users persistence and cache repository.
     * @param authSessionService Exported auth service for session lifecycle ops.
     * @param s3Service AWS S3 service for presigned URL generation.
     * @param redis Redis client for pub/sub and cache operations.
     * @param messagingService Abstracted messaging service for dispatching events and jobs.
     * @param config Config service for environment variables and constants access.
     */
    constructor(
        private readonly usersRepository: UsersRepository,
        private readonly authSessionService: AuthSessionService,
        private readonly s3Service: S3Service,
        private readonly redis: RedisService,
        private readonly messagingService: MessagingService,
        private readonly config: ConfigService,
        private readonly feedFacade: FeedFacade,
    ) {
        super();
    }

    // -----------------------------------------------------------------------
    // Profile
    // -----------------------------------------------------------------------

    /**
     * Return the full profile for the authenticated user, including OAuth
     * metadata.
     *
     * @param userId Authenticated user UUID.
     * @returns Full profile response with has_password and linked_providers.
     */
    async getMyProfile(userId: string): Promise<ProfileResponseDto> {
        const user = await this.usersRepository.findById(userId);
        if (!user) {
            throw new UnauthorizedException();
        }

        const linked_providers =
            await this.usersRepository.getLinkedProviders(userId);

        return toProfileResponseDto(user, linked_providers);
    }

    /**
     * Check whether a username is available for the authenticated user to
     * take. Returns available: true when the username is free OR when it
     * already belongs to the requesting user - so the update form does not
     * show a false conflict on the user's own current username.
     *
     * Intended for real-time UI feedback as the user types (debounced).
     *
     * @param userId Authenticated user UUID.
     * @param username Username string to check.
     * @returns Availability result with the checked username echoed back.
     */
    async checkUsername(
        userId: string,
        username: string,
    ): Promise<UsernameCheckResponseDto> {
        const taken = await this.usersRepository.existsByUsernameForOtherUser(
            username,
            userId,
        );
        return { username, available: !taken };
    }

    /**
     * Update mutable profile fields for the authenticated user.
     * If experience_level changes, invalidates the feed cache and enqueues
     * a feed rebuild.
     *
     * @param userId Authenticated user UUID.
     * @param dto Fields to update (all optional).
     * @returns Updated profile snapshot.
     */
    async updateProfile(
        userId: string,
        dto: UpdateProfileDto,
    ): Promise<UpdateProfileResponseDto> {
        if (dto.username !== undefined) {
            const taken =
                await this.usersRepository.existsByUsernameForOtherUser(
                    dto.username,
                    userId,
                );
            if (taken) {
                throw new UsernameConflictException();
            }
        }

        // Persist - clearBio = true when dto.bio is explicitly null.
        const updated = await this.usersRepository.updateProfile(userId, {
            username: dto.username,
            bio: dto.bio,
            clearBio: dto.bio === null,
            experience_level: dto.experience_level,
        });

        // experience_level changed -> bust feed cache + rebuild.
        if (dto.experience_level !== undefined) {
            await this.redis.del(
                `${USERS_REDIS_KEYS.FEED_QUEUE_PREFIX}:${userId}`,
            );

            void this.feedFacade.triggerRebuild(userId);
        }

        return {
            id: updated.id,
            username: updated.username,
            bio: updated.bio,
            experience_level: updated.experience_level,
            updated_at: updated.updated_at,
        };
    }

    // -----------------------------------------------------------------------
    // Onboarding
    // -----------------------------------------------------------------------

    /**
     * Complete onboarding for new OAuth users by setting their topic
     * interests and experience level, then triggering a feed build.
     *
     * @param userId Authenticated user UUID.
     * @param dto Onboarding payload with topics and experience level.
     * @returns Onboarding confirmation with experience level and topic count.
     */
    async completeOnboarding(
        userId: string,
        dto: CompleteOnboardingDto,
    ): Promise<OnboardingResponseDto> {
        const validIds = await this.usersRepository.validateTagIds(dto.topics);
        if (validIds.length !== dto.topics.length) {
            throw new InvalidTopicsException();
        }

        await this.usersRepository.updateExperienceLevel(
            userId,
            dto.experience_level,
        );

        // Seed topic affinity - idempotent upsert, score = 1.0
        await this.usersRepository.seedTopicAffinity(userId, dto.topics, 1.0);

        // Enqueue feed build - fire and forget
        void this.feedFacade.triggerOnboardingBuild(userId);

        return {
            message: USERS_MESSAGES.ONBOARDING_COMPLETE,
            experience_level: dto.experience_level,
            topics_count: dto.topics.length,
        };
    }

    // -----------------------------------------------------------------------
    // Avatar
    // -----------------------------------------------------------------------

    /**
     * Generate a presigned S3 PUT URL for a client-side avatar upload.
     * Stores the pending avatar key in cache with a 600-second TTL.
     * The server never handles image bytes.
     *
     * @param userId Authenticated user UUID.
     * @param dto Avatar upload request specifying the image MIME type.
     * @returns Presigned upload URL, S3 key, and expiry timestamp.
     */
    async getAvatarUploadUrl(
        userId: string,
        dto: AvatarUploadDto,
    ): Promise<AvatarUploadResponseDto> {
        // Derive file extension from MIME type
        const ext = S3Service.extensionFromMimeType(dto.file_type);

        // Build S3 key (file path) - includes user ID and a new UUID to avoid collisions
        const avatarKey = buildAvatarKey(userId, ext);

        // Generate presigned PUT URL - 5 MB max, 300 second expiry
        const { upload_url, expires_at } =
            await this.s3Service.generatePresignedPutUrl({
                key: avatarKey,
                contentType: dto.file_type,
                maxSizeBytes: 5242880,
                expiresIn: 300,
            });

        // Cache pending with TTL - used for later confirmation step.
        await this.usersRepository.storePendingAvatar(userId, avatarKey);

        return { upload_url, avatar_key: avatarKey, expires_at };
    }

    /**
     * Confirm an avatar upload by verifying the key exists in both the
     * pending cache and in S3, then updating the user record.
     *
     * @param userId Authenticated user UUID.
     * @param dto Confirmation payload carrying the avatar S3 key.
     * @returns The full CDN URL of the confirmed avatar.
     */
    async confirmAvatar(
        userId: string,
        dto: ConfirmAvatarDto,
    ): Promise<ConfirmAvatarResponseDto> {
        // Validate pending cache - must exist and match the provided key
        const pendingKey = await this.usersRepository.getPendingAvatar(userId);
        if (!pendingKey || pendingKey !== dto.avatar_key) {
            throw new InvalidAvatarKeyException();
        }

        // Validate object exists in S3
        const exists = await this.s3Service.objectExists(dto.avatar_key);
        if (!exists) {
            throw new InvalidAvatarKeyException();
        }

        // Build CDN URL, persist, clean up cache
        const avatar_url = this.s3Service.getCdnUrl(dto.avatar_key);
        await this.usersRepository.updateAvatarUrl(userId, avatar_url);
        await this.usersRepository.deletePendingAvatar(userId);

        return { avatar_url };
    }

    // -----------------------------------------------------------------------
    // Account deactivation
    // -----------------------------------------------------------------------

    /**
     * Deactivate the authenticated user's account. Verifies password for
     * credential-based accounts, sets status to deactivated, revokes all
     * sessions, and publishes the ACCOUNT_DEACTIVATED event.
     *
     * @param userId Authenticated user UUID.
     * @param dto Deactivation payload (password required for non-OAuth users).
     * @returns Success message.
     */
    async deactivateAccount(
        userId: string,
        dto: DeactivateDto,
    ): Promise<MessageResponseDto> {
        const user = await this.usersRepository.findById(userId);
        if (!user) {
            throw new UnauthorizedException();
        }

        // Password check - only for accounts that have a password set
        if (user.password_hash !== null) {
            const passwordValid = await compareHash(
                dto.password ?? "",
                user.password_hash,
            );
            if (!passwordValid) {
                throw new InvalidCredentialsException();
            }
        }

        await this.usersRepository.setAccountStatus(
            userId,
            USERS_ACCOUNT_STATUSES.DEACTIVATED,
        );

        // Revoke all sessions and invalidate existing JWTs.
        await this.authSessionService.revokeAllSessions(userId);
        await this.authSessionService.incrementTokenVersion(userId);

        const payload: UserAccountDeactivatedEventPayload = { userId };
        void this.messagingService.dispatchEvent(
            USERS_MANIFEST.events.ACCOUNT_DEACTIVATED.eventType,
            payload,
        );

        return { message: USERS_MESSAGES.ACCOUNT_DEACTIVATED };
    }

    // -----------------------------------------------------------------------
    // XP history
    // -----------------------------------------------------------------------

    /**
     * Return a cursor-paginated slice of the authenticated user's XP ledger.
     *
     * @param userId Authenticated user UUID.
     * @param cursor UUID of the last seen entry, or undefined for first page.
     * @param limit Maximum entries to return (default 20, max 50).
     * @returns Paginated XP ledger entries with running total and cursor.
     */
    async getXpHistory(
        userId: string,
        cursor: string | undefined,
        limit: number,
    ): Promise<XpHistoryResponseDto> {
        const rows = await this.usersRepository.getXpLedger(
            userId,
            cursor ?? null,
            limit,
        );

        const total_xp = await this.usersRepository.getTotalXp(userId);

        // next_cursor is set only when a full page was returned
        const next_cursor =
            rows.length === limit ? (rows[rows.length - 1]?.id ?? null) : null;

        return {
            data: rows,
            meta: {
                next_cursor,
                has_more: next_cursor !== null,
                total_xp,
            },
        };
    }

    // -----------------------------------------------------------------------
    // Badges
    // -----------------------------------------------------------------------

    /**
     * Return all badges earned by the authenticated user.
     *
     * @param userId Authenticated user UUID.
     * @returns Badge collection with total count metadata.
     */
    async getBadges(userId: string): Promise<BadgesResponseDto> {
        const badges = await this.usersRepository.getUserBadges(userId);
        return {
            data: badges,
            meta: { total_earned: badges.length },
        };
    }

    // -----------------------------------------------------------------------
    // Stats
    // -----------------------------------------------------------------------

    /**
     * Return gamification and activity statistics for the authenticated user.
     *
     * @param userId Authenticated user UUID.
     * @returns Aggregated stats including XP, streaks, challenges, and rank.
     */
    async getStats(userId: string): Promise<StatsResponseDto> {
        const [
            user,
            badges_earned,
            reels_watched,
            challengeStats,
            paths_completed,
            topTagId,
        ] = await Promise.all([
            this.usersRepository.findById(userId),
            this.usersRepository.getBadgeCount(userId),
            this.usersRepository.getReelsWatchedCount(userId),
            this.usersRepository.getChallengeStats(userId),
            this.usersRepository.getPathsCompletedCount(userId),
            this.usersRepository.getTopTagId(userId),
        ]);

        if (!user) {
            throw new UnauthorizedException();
        }

        const leaderboard_rank = topTagId
            ? await this.usersRepository.getLeaderboardRank(userId, topTagId)
            : null;

        return {
            total_xp: user.total_xp,
            token_balance: user.token_balance,
            current_streak: user.current_streak,
            longest_streak: user.longest_streak,
            badges_earned,
            reels_watched,
            challenges_attempted: challengeStats.total_attempted,
            challenges_correct: challengeStats.total_correct,
            accuracy_rate: challengeStats.accuracy_rate,
            paths_completed,
            leaderboard_rank:
                leaderboard_rank !== null ? leaderboard_rank + 1 : null, // convert 0-based to 1-based rank
        };
    }

    /**
     * Return the weekly leaderboard for a tag with the requesting user's
     * own rank in the meta block. If tag_id is not provided, auto-resolves
     * the user's top affinity tag with DB fallback.
     *
     * @param userId Authenticated user UUID.
     * @param tagId Optional tag UUID override. Defaults to user's top tag.
     * @param limit Number of top entries to return. Default 20, max 50.
     * @returns Leaderboard entries with user rank/score in meta.
     */
    async getLeaderboard(
        userId: string,
        tagId: string | undefined,
        limit: number,
    ): Promise<LeaderboardResponseDto> {
        // Resolve tag - explicit override or auto top-tag with DB fallback
        const resolvedTagId =
            tagId ?? (await this.usersRepository.getTopTagId(userId));
        if (!resolvedTagId) {
            // User has no affinity data at all - return empty leaderboard
            return {
                data: [],
                meta: {
                    tag_id: "",
                    tag_name: "",
                    user_rank: null,
                    user_score: null,
                    total_on_board: 0,
                },
            };
        }

        // Fetch all leaderboard data in parallel
        const [topEntries, userRank0Based, userScore, totalOnBoard, tagName] =
            await Promise.all([
                this.usersRepository.getLeaderboardTopEntries(
                    resolvedTagId,
                    limit,
                ),
                this.usersRepository.getLeaderboardRank(userId, resolvedTagId),
                this.usersRepository.getLeaderboardUserScore(
                    resolvedTagId,
                    userId,
                ),
                this.usersRepository.getLeaderboardSize(resolvedTagId),
                this.usersRepository.getTagName(resolvedTagId),
            ]);

        // Resolve usernames for top entries in one DB query
        const userIds = topEntries.map((e) => e.userId);
        const usernameMap =
            await this.usersRepository.getUsernamesByIds(userIds);

        // Build data array - rank is 1-based
        const data = topEntries.map((entry, index) => ({
            rank: index + 1,
            username: usernameMap.get(entry.userId) ?? "unknown",
            score: entry.score,
        }));

        // Build meta - convert 0-based ZREVRANK to 1-based for the response
        return {
            data,
            meta: {
                tag_id: resolvedTagId,
                tag_name: tagName ?? "",
                user_rank: userRank0Based !== null ? userRank0Based + 1 : null,
                user_score: userScore,
                total_on_board: totalOnBoard,
            },
        };
    }

    // -----------------------------------------------------------------------
    // Public profile token
    // -----------------------------------------------------------------------

    /**
     * Generate a new 64-char hex public profile token for the authenticated
     * user. Replaces any previously existing token.
     *
     * @param userId Authenticated user UUID.
     * @returns New token and the full recruiter-facing profile URL.
     */
    async generatePublicToken(
        userId: string,
    ): Promise<{ public_profile_token: string; public_profile_url: string }> {
        const baseUrl =
            this.config.get<string>("API_BASE_URL") ?? "http://localhost:3000";
        const token = crypto.randomBytes(32).toString("hex");
        await this.usersRepository.setPublicProfileToken(userId, token);
        return {
            public_profile_token: token,
            public_profile_url: `${baseUrl}/profile/${token}`,
        };
    }

    /**
     * Revoke the authenticated user's public profile token.
     *
     * @param userId Authenticated user UUID.
     * @returns Success message.
     */
    async revokePublicToken(userId: string): Promise<MessageResponseDto> {
        await this.usersRepository.setPublicProfileToken(userId, null);
        return { message: USERS_MESSAGES.TOKEN_REVOKED };
    }

    // -----------------------------------------------------------------------
    // Public profiles
    // -----------------------------------------------------------------------

    /**
     * Return the public profile for a username. Returns 404 for any
     * non-active account so account status is never revealed to
     * unauthenticated callers.
     *
     * @param username Username to look up.
     * @returns Public profile response (no email or private fields).
     */
    async getPublicProfile(
        username: string,
    ): Promise<PublicProfileResponseDto> {
        const user = await this.usersRepository.findByUsername(username);
        if (!user || user.account_status !== USERS_ACCOUNT_STATUSES.ACTIVE) {
            throw new UserNotFoundException();
        }

        const [allBadges, reels_count] = await Promise.all([
            this.usersRepository.getUserBadges(user.id),
            this.usersRepository.getReelsCount(user.id),
        ]);

        // Top 10, minimal public shape (code, name, icon_url only)
        const badges = allBadges.slice(0, 10).map(toPublicBadge);

        return toPublicProfileBase(user, badges, reels_count);
    }

    /**
     * Return the recruiter-facing profile for a public profile token.
     * Returns 404 for null or any non-active account.
     *
     * @param token 64-char hex public profile token.
     * @returns Enriched recruiter-facing profile response.
     */
    async getProfileByToken(token: string): Promise<PublicProfileResponseDto> {
        const user = await this.usersRepository.findByPublicProfileToken(token);
        if (!user || user.account_status !== USERS_ACCOUNT_STATUSES.ACTIVE) {
            throw new ProfileNotFoundException();
        }

        const [
            allBadges,
            top_topics,
            challengeStats,
            reels_watched,
            reels_count,
            paths_completed,
        ] = await Promise.all([
            this.usersRepository.getUserBadges(user.id),
            this.usersRepository.getTopTopics(user.id),
            this.usersRepository.getChallengeStats(user.id),
            this.usersRepository.getReelsWatchedCount(user.id),
            this.usersRepository.getReelsCount(user.id),
            this.usersRepository.getPathsCompletedCount(user.id),
        ]);

        // Full recruiter badge shape (adds description + earned_at)
        const badges = allBadges.map(toRecruiterBadge);

        return {
            ...toPublicProfileBase(user, badges, reels_count),
            accuracy_rate: challengeStats.accuracy_rate,
            top_topics,
            paths_completed,
            challenges_correct: challengeStats.total_correct,
            challenges_attempted: challengeStats.total_attempted,
            reels_watched,
            reels_published: reels_count,
        };
    }
}
