/**
 * @module modules/users/users.controller
 * @description
 * Controller exposing all 14 user profile endpoints: own profile,
 * username availability check, profile update, OAuth onboarding, avatar
 * upload and confirmation, account deactivation, XP history, badges,
 * gamification stats, public profile token management, and public profile
 * lookups.
 */

import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
    Query,
    UseGuards,
} from "@nestjs/common";
import {
    ApiBearerAuth,
    ApiOperation,
    ApiParam,
    ApiQuery,
    ApiResponse,
    ApiTags,
} from "@nestjs/swagger";

import { UsersService } from "./users.service.abstract";

import { UpdateProfileDto } from "./dto/update-profile.dto";
import { UpdateProfileResponseDto } from "./dto/update-profile-response.dto";
import { CompleteOnboardingDto } from "./dto/complete-onboarding.dto";
import { OnboardingResponseDto } from "./dto/onboarding-response.dto";
import { AvatarUploadDto } from "./dto/avatar-upload.dto";
import { AvatarUploadResponseDto } from "./dto/avatar-upload-response.dto";
import { ConfirmAvatarDto } from "./dto/confirm-avatar.dto";
import { ConfirmAvatarResponseDto } from "./dto/confirm-avatar-response.dto";
import { DeactivateDto } from "./dto/deactivate.dto";
import { ProfileResponseDto } from "./dto/profile-response.dto";
import { PublicProfileResponseDto } from "./dto/public-profile-response.dto";
import { XpHistoryResponseDto } from "./dto/xp-history-response.dto";
import { BadgesResponseDto } from "./dto/badges-response.dto";
import { StatsResponseDto } from "./dto/stats-response.dto";
import { UsernameCheckResponseDto } from "./dto/username-check-response.dto";
import { MessageResponseDto } from "../../common/dto/message-response.dto";
import { ApiErrorDto } from "../../common/dto/api-error.dto";

import { SkipAuth } from "../../common/decorators/skip-auth.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SetRateLimit } from "../../common/guards/rate-limit.guard";
import { RateLimitGuard } from "../../common/guards/rate-limit.guard";
import { USERS_RATE_LIMITS } from "./users.constants";
import { LeaderboardResponseDto } from "./dto/leaderboard-response.dto";

/**
 * Thin transport layer for all user profile use cases.
 * Contains no business logic - delegates everything to UsersService.
 */
@ApiTags("Users")
@Controller("users")
export class UsersController {
    /**
     * @param usersService User profile application service.
     */
    constructor(private readonly usersService: UsersService) {}

    // -----------------------------------------------------------------------
    // GET /users/me
    // -----------------------------------------------------------------------

    /**
     * Return the full profile of the authenticated user.
     *
     * @param userId Authenticated user UUID from JWT context.
     * @returns Full profile including OAuth metadata.
     */
    @Get("me")
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth("access-token")
    @ApiOperation({
        summary: "Get own profile",
        description:
            "Returns the full profile of the currently authenticated user, " +
            "including has_password and linked OAuth providers.",
    })
    @ApiResponse({
        status: 200,
        description: "Profile returned.",
        type: ProfileResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    async getMe(
        @CurrentUser("userId") userId: string,
    ): Promise<ProfileResponseDto> {
        return this.usersService.getMyProfile(userId);
    }

    // -----------------------------------------------------------------------
    // GET /users/me/check-username
    // -----------------------------------------------------------------------

    /**
     * Check whether a username is available for the authenticated user.
     * Returns available: true when the username is free, or when it already
     * belongs to the requesting user (prevents false conflict on own username).
     * Intended for real-time debounced feedback as the user types.
     *
     * @param userId Authenticated user UUID from JWT context.
     * @param username Username string to check.
     * @returns Availability flag with the checked username echoed back.
     */
    @Get("me/check-username")
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth("access-token")
    @ApiOperation({
        summary: "Check username availability",
        description:
            "Returns whether the given username is available for the authenticated user " +
            "to claim. Returns available: true when free, or when the username is already " +
            "the user's own current username (prevents a false conflict in the update form). " +
            "Call this debounced as the user types before submitting PATCH /users/me.",
    })
    @ApiQuery({
        name: "username",
        required: true,
        description:
            "Username string to check. Must be 3-50 chars, letters/numbers/underscores.",
        example: "alice_dev",
    })
    @ApiResponse({
        status: 200,
        description: "Availability result returned.",
        type: UsernameCheckResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    async checkUsername(
        @CurrentUser("userId") userId: string,
        @Query("username") username: string,
    ): Promise<UsernameCheckResponseDto> {
        return this.usersService.checkUsername(userId, username);
    }

    // -----------------------------------------------------------------------
    // PATCH /users/me
    // -----------------------------------------------------------------------

    /**
     * Update mutable profile fields for the authenticated user.
     *
     * @param userId Authenticated user UUID from JWT context.
     * @param dto Fields to update (all optional).
     * @returns Updated profile snapshot.
     */
    @Patch("me")
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth("access-token")
    @SetRateLimit(USERS_RATE_LIMITS.PROFILE_UPDATE)
    @UseGuards(RateLimitGuard)
    @ApiOperation({
        summary: "Update own profile",
        description:
            "Updates username, bio, and/or experience level. All fields optional. " +
            "Send bio: null to explicitly clear the bio. " +
            "Rate limited to 10 requests per hour per user.",
    })
    @ApiResponse({
        status: 200,
        description: "Profile updated.",
        type: UpdateProfileResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: "Validation failed.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 409,
        description: "Username already taken.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 429,
        description: "Rate limit exceeded.",
        type: ApiErrorDto,
    })
    async updateProfile(
        @CurrentUser("userId") userId: string,
        @Body() dto: UpdateProfileDto,
    ): Promise<UpdateProfileResponseDto> {
        return this.usersService.updateProfile(userId, dto);
    }

    // -----------------------------------------------------------------------
    // POST /users/me/onboarding
    // -----------------------------------------------------------------------

    /**
     * Complete onboarding for new OAuth users by setting topics and
     * experience level.
     *
     * @param userId Authenticated user UUID from JWT context.
     * @param dto Onboarding payload with topics and experience level.
     * @returns Onboarding confirmation with topic count.
     */
    @Post("me/onboarding")
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth("access-token")
    @SetRateLimit(USERS_RATE_LIMITS.ONBOARDING)
    @UseGuards(RateLimitGuard)
    @ApiOperation({
        summary: "Complete onboarding",
        description:
            "Sets topic interests and experience level for new OAuth users. " +
            "Idempotent - safe to call multiple times. " +
            "Triggers a feed build job on success. " +
            "Rate limited to 5 requests per hour per user.",
    })
    @ApiResponse({
        status: 200,
        description: "Onboarding complete.",
        type: OnboardingResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: "Validation failed.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 422,
        description: "One or more topic IDs do not exist.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 429,
        description: "Rate limit exceeded.",
        type: ApiErrorDto,
    })
    async completeOnboarding(
        @CurrentUser("userId") userId: string,
        @Body() dto: CompleteOnboardingDto,
    ): Promise<OnboardingResponseDto> {
        return this.usersService.completeOnboarding(userId, dto);
    }

    // -----------------------------------------------------------------------
    // POST /users/me/avatar
    // -----------------------------------------------------------------------

    /**
     * Request a presigned S3 PUT URL for a client-side avatar upload.
     * The server never handles image bytes - the client uploads directly
     * to S3 using the returned URL.
     *
     * @param userId Authenticated user UUID from JWT context.
     * @param dto Avatar upload request with MIME type.
     * @returns Presigned upload URL, S3 key, and expiry timestamp.
     */
    @Post("me/avatar")
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth("access-token")
    @SetRateLimit(USERS_RATE_LIMITS.AVATAR)
    @UseGuards(RateLimitGuard)
    @ApiOperation({
        summary: "Request avatar upload URL",
        description:
            "Returns a presigned S3 PUT URL valid for 5 minutes. " +
            "Upload the image directly from the client using this URL, " +
            "then call PATCH /users/me/avatar/confirm with the returned avatar_key. " +
            "Max file size: 5 MB. Accepted types: image/jpeg, image/png, image/webp. " +
            "Rate limited to 5 requests per hour per user.",
    })
    @ApiResponse({
        status: 200,
        description: "Presigned URL generated.",
        type: AvatarUploadResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: "Validation failed.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 429,
        description: "Rate limit exceeded.",
        type: ApiErrorDto,
    })
    async requestAvatarUpload(
        @CurrentUser("userId") userId: string,
        @Body() dto: AvatarUploadDto,
    ): Promise<AvatarUploadResponseDto> {
        return this.usersService.getAvatarUploadUrl(userId, dto);
    }

    // -----------------------------------------------------------------------
    // PATCH /users/me/avatar/confirm
    // -----------------------------------------------------------------------

    /**
     * Confirm a completed avatar upload. Verifies the key in cache and
     * S3, then updates the user's avatar_url.
     *
     * @param userId Authenticated user UUID from JWT context.
     * @param dto Confirmation payload with the S3 avatar key.
     * @returns The full CDN URL of the confirmed avatar.
     */
    @Patch("me/avatar/confirm")
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth("access-token")
    @SetRateLimit(USERS_RATE_LIMITS.AVATAR)
    @UseGuards(RateLimitGuard)
    @ApiOperation({
        summary: "Confirm avatar upload",
        description:
            "Verifies the uploaded avatar exists in S3 and updates the user record. " +
            "The avatar_key must match the one returned by POST /users/me/avatar " +
            "and must be confirmed within 10 minutes. " +
            "Rate limited to 5 requests per hour per user (shared with avatar upload).",
    })
    @ApiResponse({
        status: 200,
        description: "Avatar confirmed.",
        type: ConfirmAvatarResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: "Validation failed.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 422,
        description: "Avatar key not found in cache or S3.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 429,
        description: "Rate limit exceeded.",
        type: ApiErrorDto,
    })
    async confirmAvatar(
        @CurrentUser("userId") userId: string,
        @Body() dto: ConfirmAvatarDto,
    ): Promise<ConfirmAvatarResponseDto> {
        return this.usersService.confirmAvatar(userId, dto);
    }

    // -----------------------------------------------------------------------
    // POST /users/me/deactivate
    // -----------------------------------------------------------------------

    /**
     * Deactivate the authenticated user's account. Revokes all sessions
     * and publishes an ACCOUNT_DEACTIVATED event.
     *
     * @param userId Authenticated user UUID from JWT context.
     * @param dto Deactivation payload (password required for non-OAuth users).
     * @returns Success message.
     */
    @Post("me/deactivate")
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth("access-token")
    @SetRateLimit(USERS_RATE_LIMITS.DEACTIVATE)
    @UseGuards(RateLimitGuard)
    @ApiOperation({
        summary: "Deactivate account",
        description:
            "Permanently deactivates the account, revokes all active sessions, " +
            "and invalidates all existing JWTs. " +
            "Password is required for credential-based accounts. " +
            "Omit password for pure OAuth accounts. " +
            "Rate limited to 3 requests per hour per user.",
    })
    @ApiResponse({
        status: 200,
        description: "Account deactivated.",
        type: MessageResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: "Validation failed.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized or invalid password.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 429,
        description: "Rate limit exceeded.",
        type: ApiErrorDto,
    })
    async deactivate(
        @CurrentUser("userId") userId: string,
        @Body() dto: DeactivateDto,
    ): Promise<MessageResponseDto> {
        return this.usersService.deactivateAccount(userId, dto);
    }

    // -----------------------------------------------------------------------
    // GET /users/me/xp-history
    // -----------------------------------------------------------------------

    /**
     * Return a cursor-paginated slice of the authenticated user's XP
     * ledger, ordered newest-first.
     *
     * @param userId Authenticated user UUID from JWT context.
     * @param cursor UUID of the last seen entry for pagination.
     * @param limitRaw Maximum entries per page (default 20, max 50).
     * @returns Paginated XP ledger with running total and next cursor.
     */
    @Get("me/xp-history")
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth("access-token")
    @ApiOperation({
        summary: "Get XP history",
        description:
            "Returns a cursor-paginated list of XP ledger entries ordered by " +
            "created_at DESC. Pass the returned next_cursor as cursor to fetch " +
            "the next page.",
    })
    @ApiQuery({
        name: "cursor",
        required: false,
        description:
            "UUID v7 of the last seen XP ledger entry. Omit for first page.",
        example: "019501a0-0000-7000-8000-000000000001",
    })
    @ApiQuery({
        name: "limit",
        required: false,
        description: "Page size. Default 20, max 50.",
        example: 20,
    })
    @ApiResponse({
        status: 200,
        description: "XP history returned.",
        type: XpHistoryResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    async getXpHistory(
        @CurrentUser("userId") userId: string,
        @Query("cursor") cursor?: string,
        @Query("limit") limitRaw?: string,
    ): Promise<XpHistoryResponseDto> {
        const limit = Math.min(limitRaw ? parseInt(limitRaw, 10) : 20, 50);
        return this.usersService.getXpHistory(userId, cursor, limit);
    }

    // -----------------------------------------------------------------------
    // GET /users/me/badges
    // -----------------------------------------------------------------------

    /**
     * Return all badges earned by the authenticated user.
     *
     * @param userId Authenticated user UUID from JWT context.
     * @returns Badge collection with total count.
     */
    @Get("me/badges")
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth("access-token")
    @ApiOperation({
        summary: "Get earned badges",
        description:
            "Returns all badges earned by the authenticated user, ordered by earned_at DESC.",
    })
    @ApiResponse({
        status: 200,
        description: "Badges returned.",
        type: BadgesResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    async getBadges(
        @CurrentUser("userId") userId: string,
    ): Promise<BadgesResponseDto> {
        return this.usersService.getBadges(userId);
    }

    // -----------------------------------------------------------------------
    // GET /users/me/stats
    // -----------------------------------------------------------------------

    /**
     * Return gamification and activity statistics for the authenticated user.
     *
     * @param userId Authenticated user UUID from JWT context.
     * @returns Aggregated stats including XP, streaks, challenges, and rank.
     */
    @Get("me/stats")
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth("access-token")
    @ApiOperation({
        summary: "Get gamification stats",
        description:
            "Returns aggregated activity and gamification statistics including " +
            "XP, streaks, challenge accuracy, paths completed, and weekly leaderboard rank.",
    })
    @ApiResponse({
        status: 200,
        description: "Stats returned.",
        type: StatsResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    async getStats(
        @CurrentUser("userId") userId: string,
    ): Promise<StatsResponseDto> {
        return this.usersService.getStats(userId);
    }

    // -----------------------------------------------------------------------
    // GET /users/me/leaderboard
    // -----------------------------------------------------------------------

    /**
     * Return the weekly leaderboard for the user's top affinity tag, or a
     * specific tag if tag_id is provided.
     *
     * @param userId Authenticated user UUID from JWT context.
     * @param tagId Optional tag UUID to view a specific leaderboard.
     * @param limitRaw Number of top entries to return. Default 20, max 50.
     * @returns Top N leaderboard entries with user's own rank in meta.
     */
    @Get("me/leaderboard")
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth("access-token")
    @SetRateLimit(USERS_RATE_LIMITS.LEADERBOARD)
    @UseGuards(RateLimitGuard)
    @ApiOperation({
        summary: "Get weekly leaderboard",
        description:
            "Returns the weekly XP leaderboard for the user's top affinity tag. " +
            "Pass tag_id to view a specific tag leaderboard instead. " +
            "Returns the requesting user's own rank and score in the meta block. " +
            "Rate limited to 60 requests per hour per user.",
    })
    @ApiQuery({
        name: "tag_id",
        required: false,
        description:
            "Tag UUID to view. Defaults to the user's top affinity tag.",
        example: "019501a0-0000-7000-8000-000000000001",
    })
    @ApiQuery({
        name: "limit",
        required: false,
        description: "Number of top entries. Default 20, max 50.",
        example: 20,
    })
    @ApiResponse({
        status: 200,
        description: "Leaderboard returned.",
        type: LeaderboardResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 429,
        description: "Rate limit exceeded.",
        type: ApiErrorDto,
    })
    async getLeaderboard(
        @CurrentUser("userId") userId: string,
        @Query("tag_id") tagId?: string,
        @Query("limit") limitRaw?: string,
    ): Promise<LeaderboardResponseDto> {
        const limit = Math.min(limitRaw ? parseInt(limitRaw, 10) : 20, 50);
        return this.usersService.getLeaderboard(userId, tagId, limit);
    }

    // -----------------------------------------------------------------------
    // POST /users/me/public-profile-token
    // -----------------------------------------------------------------------

    /**
     * Generate a new recruiter-facing public profile token. Replaces any
     * existing token.
     *
     * @param userId Authenticated user UUID from JWT context.
     * @returns New 64-char hex token and the full profile URL.
     */
    @Post("me/public-profile-token")
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth("access-token")
    @SetRateLimit(USERS_RATE_LIMITS.PUBLIC_TOKEN)
    @UseGuards(RateLimitGuard)
    @ApiOperation({
        summary: "Generate public profile token",
        description:
            "Generates a new 64-char hex recruiter-facing profile token. " +
            "Replaces any previously existing token - share the new URL after generating. " +
            "Rate limited to 5 requests per hour per user.",
    })
    @ApiResponse({
        status: 200,
        description: "Token generated.",
        schema: {
            properties: {
                public_profile_token: { type: "string", example: "a1b2c3..." },
                public_profile_url: {
                    type: "string",
                    example: "https://techreel.io/profile/a1b2c3...",
                },
            },
        },
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 429,
        description: "Rate limit exceeded.",
        type: ApiErrorDto,
    })
    async generatePublicToken(
        @CurrentUser("userId") userId: string,
    ): Promise<{ public_profile_token: string; public_profile_url: string }> {
        return this.usersService.generatePublicToken(userId);
    }

    // -----------------------------------------------------------------------
    // DELETE /users/me/public-profile-token
    // -----------------------------------------------------------------------

    /**
     * Revoke the authenticated user's public profile token.
     *
     * @param userId Authenticated user UUID from JWT context.
     * @returns Success message.
     */
    @Delete("me/public-profile-token")
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth("access-token")
    @SetRateLimit(USERS_RATE_LIMITS.PUBLIC_TOKEN)
    @UseGuards(RateLimitGuard)
    @ApiOperation({
        summary: "Revoke public profile token",
        description:
            "Clears the public profile token. The recruiter-facing URL will return 404 " +
            "until a new token is generated. " +
            "Rate limited to 5 requests per hour per user (shared with token generation).",
    })
    @ApiResponse({
        status: 200,
        description: "Token revoked.",
        type: MessageResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 429,
        description: "Rate limit exceeded.",
        type: ApiErrorDto,
    })
    async revokePublicToken(
        @CurrentUser("userId") userId: string,
    ): Promise<MessageResponseDto> {
        return this.usersService.revokePublicToken(userId);
    }

    // -----------------------------------------------------------------------
    // GET /users/public/:token
    // NOTE: declared BEFORE /:username so NestJS does not treat "public"
    // as a username param.
    // -----------------------------------------------------------------------

    /**
     * Return the recruiter-facing public profile identified by token.
     * No authentication required. Returns 404 for inactive accounts.
     *
     * @param token 64-char hex public profile token from the URL.
     * @returns Enriched recruiter-facing profile.
     */
    @Get("public/:token")
    @SkipAuth()
    @HttpCode(HttpStatus.OK)
    @SetRateLimit(USERS_RATE_LIMITS.PUBLIC_PROFILE)
    @UseGuards(RateLimitGuard)
    @ApiOperation({
        summary: "Get public profile by token",
        description:
            "Returns the recruiter-facing profile identified by the public profile token. " +
            "Includes top topics, challenge accuracy, paths completed, and full badge history. " +
            "Returns 404 for inactive accounts without revealing account status. " +
            "Rate limited to 30 requests per hour per IP.",
    })
    @ApiParam({
        name: "token",
        description: "64-char hex public profile token.",
        example:
            "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    })
    @ApiResponse({
        status: 200,
        description: "Profile returned.",
        type: PublicProfileResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: "Profile not found.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 429,
        description: "Rate limit exceeded.",
        type: ApiErrorDto,
    })
    async getProfileByToken(
        @Param("token") token: string,
    ): Promise<PublicProfileResponseDto> {
        return this.usersService.getProfileByToken(token);
    }

    // -----------------------------------------------------------------------
    // GET /users/:username
    // NOTE: declared LAST - wildcard param must come after all static
    // sub-paths (/me/*, /public/:token) to avoid param capture.
    // -----------------------------------------------------------------------

    /**
     * Return the public profile for a username. No authentication required.
     * Returns 404 for any non-active account status to avoid revealing
     * account state.
     *
     * @param username Username from the URL path.
     * @returns Public profile without private fields.
     */
    @Get(":username")
    @SkipAuth()
    @HttpCode(HttpStatus.OK)
    @SetRateLimit(USERS_RATE_LIMITS.PUBLIC_PROFILE)
    @UseGuards(RateLimitGuard)
    @ApiOperation({
        summary: "Get public profile by username",
        description:
            "Returns the public profile for the given username. " +
            "Suspended and banned accounts return 404 - account status is never revealed. " +
            "Rate limited to 30 requests per hour per IP.",
    })
    @ApiParam({
        name: "username",
        description: "The username to look up.",
        example: "alice_dev",
    })
    @ApiResponse({
        status: 200,
        description: "Profile returned.",
        type: PublicProfileResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: "User not found.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 429,
        description: "Rate limit exceeded.",
        type: ApiErrorDto,
    })
    async getPublicProfile(
        @Param("username") username: string,
    ): Promise<PublicProfileResponseDto> {
        return this.usersService.getPublicProfile(username);
    }
}
