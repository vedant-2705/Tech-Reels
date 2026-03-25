/**
 * @module modules/challenges/challenges.controller
 * @description
 * Controller exposing challenge endpoints:
 *   GET  /reels/:reelId/challenges   - list challenges for a reel
 *   POST /challenges/:id/attempt     - submit an answer attempt
 *   GET  /challenges/:id/attempts/me - get own attempt history
 *
 * All routes require JWT authentication (global JwtAuthGuard).
 * POST /challenges/:id/attempt is rate-limited to 30 requests/hr/user.
 * Controller has zero business logic - delegates entirely to ChallengesService.
 */

import {
    Controller,
    Get,
    Post,
    Param,
    Body,
    Headers,
    HttpCode,
    HttpStatus,
    UseGuards,
    Patch,
    Delete,
} from "@nestjs/common";
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiParam,
    ApiHeader,
} from "@nestjs/swagger";

import { ChallengesService } from "./challenges.service";
import { ChallengeResponseDto } from "./dto/challenge-response.dto";
import { SubmitAttemptDto } from "./dto/submit-attempt.dto";
import { AttemptResultDto } from "./dto/attempt-result.dto";

import { CurrentUser } from "@common/decorators/current-user.decorator";
import { RateLimitGuard, SetRateLimit } from "@common/guards/rate-limit.guard";
import { ApiErrorDto } from "@common/dto/api-error.dto";
import { IDEMPOTENCY_HEADER } from "./challenges.constants";
import { CreateChallengeDto } from "./dto/create-challenge.dto";
import { Challenge } from "./entities/challenge.entity";
import { UpdateChallengeDto } from "./dto/update-challenge.dto";

/**
 * Thin transport layer - extracts params/headers, calls service, returns result.
 */
@ApiTags("Challenges")
@ApiBearerAuth("access-token")
@Controller()
export class ChallengesController {
    /**
     * @param challengesService Challenges application service.
     */
    constructor(private readonly challengesService: ChallengesService) {}

    // -------------------------------------------------------------------------
    // GET /reels/:reelId/challenges
    // -------------------------------------------------------------------------

    /**
     * Returns all challenges for a reel with the caller's attempt status merged in.
     * correct_answer is never included in this response.
     *
     * @param userId  Authenticated user UUID from JWT.
     * @param reelId  UUID of the reel from route parameter.
     * @returns       Ordered list of challenges with attempt status.
     */
    @Get("reels/:reelId/challenges")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: "Get challenges for a reel",
        description:
            "Returns all challenges attached to a reel, ordered by position. " +
            "correct_answer is never included. " +
            "Each challenge includes the requesting user's latest attempt status. " +
            "The reel must exist and have status: active.",
    })
    @ApiParam({
        name: "reelId",
        description: "UUID v7 of the reel.",
        example: "019501a0-0000-7000-8000-000000000001",
    })
    @ApiResponse({
        status: 200,
        description: "Challenges returned successfully.",
        type: [ChallengeResponseDto],
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized - invalid or expired token.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 404,
        description: "Reel not found or not active.",
        type: ApiErrorDto,
    })
    async getChallenges(
        @CurrentUser("userId") userId: string,
        @Param("reelId") reelId: string,
    ): Promise<ChallengeResponseDto[]> {
        return this.challengesService.getChallenges(userId, reelId);
    }

    // -------------------------------------------------------------------------
    // POST /reels/:reelId/challenges
    // -------------------------------------------------------------------------

    /**
     * Creates a new challenge for a reel.
     * Accessible by admins and the reel creator.
     *
     * @param userId   Authenticated user UUID from JWT.
     * @param role     User role from JWT (to determine admin bypass).
     * @param reelId   UUID of the reel from route parameter.
     * @param dto      Validated creation payload.
     * @returns        The newly created Challenge row.
     */
    @Post("reels/:reelId/challenges")
    @HttpCode(HttpStatus.CREATED)
    @SetRateLimit({ limit: 20, windowSeconds: 3600, scope: "user" })
    @UseGuards(RateLimitGuard)
    @ApiOperation({
        summary: "Create a challenge for a reel",
        description:
            "Creates a new challenge attached to a reel. " +
            "Accessible by admins and the reel creator. " +
            "A reel can have at most 3 challenges. " +
            "options[] is required for mcq (4 items) and true_false (2 items); " +
            "must be omitted for code_fill and output_prediction. " +
            "XP reward is derived automatically from difficulty. " +
            "Rate limited to 20 requests per hour per user.",
    })
    @ApiParam({
        name: "reelId",
        description: "UUID v7 of the reel.",
        example: "019501a0-0000-7000-8000-000000000001",
    })
    @ApiResponse({
        status: 201,
        description: "Challenge created successfully.",
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
        status: 404,
        description: "Reel not found.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 422,
        description:
            "Invalid payload - options/type mismatch, max challenges reached, or not reel owner.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 429,
        description: "Rate limit exceeded.",
        type: ApiErrorDto,
    })
    async createChallenge(
        @CurrentUser("userId") userId: string,
        @CurrentUser("role") role: string,
        @Param("reelId") reelId: string,
        @Body() dto: CreateChallengeDto,
    ): Promise<Challenge> {
        return this.challengesService.createChallenge(
            userId,
            reelId,
            dto,
            role === "admin",
        );
    }

    // -------------------------------------------------------------------------
    // PATCH /challenges/:id
    // -------------------------------------------------------------------------

    /**
     * Partially updates an existing challenge.
     * Accessible by admins and the reel creator.
     *
     * @param userId  Authenticated user UUID from JWT.
     * @param role    User role from JWT.
     * @param id      UUID of the challenge from route parameter.
     * @param dto     Partial update payload.
     * @returns       Updated Challenge row.
     */
    @Patch("challenges/:id")
    @HttpCode(HttpStatus.OK)
    @SetRateLimit({ limit: 30, windowSeconds: 3600, scope: "user" })
    @UseGuards(RateLimitGuard)
    @ApiOperation({
        summary: "Update a challenge",
        description:
            "Partially updates a challenge. All fields are optional. " +
            "Accessible by admins and the reel creator. " +
            "Cross-field validation (options vs type) is enforced using the " +
            "effective post-update values. " +
            "Rate limited to 30 requests per hour per user.",
    })
    @ApiParam({
        name: "id",
        description: "UUID v7 of the challenge.",
        example: "019501a0-0000-7000-8000-000000000002",
    })
    @ApiResponse({
        status: 200,
        description: "Challenge updated successfully.",
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
        status: 404,
        description: "Challenge not found.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 422,
        description:
            "Invalid payload - options/type mismatch or not reel owner.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 429,
        description: "Rate limit exceeded.",
        type: ApiErrorDto,
    })
    async updateChallenge(
        @CurrentUser("userId") userId: string,
        @CurrentUser("role") role: string,
        @Param("id") id: string,
        @Body() dto: UpdateChallengeDto,
    ): Promise<Challenge> {
        return this.challengesService.updateChallenge(
            userId,
            id,
            dto,
            role === "admin",
        );
    }

    // -------------------------------------------------------------------------
    // DELETE /challenges/:id
    // -------------------------------------------------------------------------

    /**
     * Soft-deletes a challenge.
     * Accessible by admins and the reel creator.
     *
     * @param userId  Authenticated user UUID from JWT.
     * @param role    User role from JWT.
     * @param id      UUID of the challenge from route parameter.
     */
    @Delete("challenges/:id")
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({
        summary: "Delete a challenge",
        description:
            "Soft-deletes a challenge. " +
            "Accessible by admins and the reel creator. " +
            "Existing attempt records are preserved (challenges_attempts is append-only).",
    })
    @ApiParam({
        name: "id",
        description: "UUID v7 of the challenge.",
        example: "019501a0-0000-7000-8000-000000000002",
    })
    @ApiResponse({
        status: 204,
        description: "Challenge deleted successfully.",
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 404,
        description: "Challenge not found.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 422,
        description: "Caller does not own this reel.",
        type: ApiErrorDto,
    })
    async deleteChallenge(
        @CurrentUser("userId") userId: string,
        @CurrentUser("role") role: string,
        @Param("id") id: string,
    ): Promise<void> {
        return this.challengesService.deleteChallenge(
            userId,
            id,
            role === "admin",
        );
    }

    // -------------------------------------------------------------------------
    // POST /challenges/:id/attempt
    // -------------------------------------------------------------------------

    /**
     * Submits an answer attempt for a challenge.
     * Rate-limited to 30 per hour per user.
     * Supports optional idempotency via X-Idempotency-Key header.
     *
     * @param userId         Authenticated user UUID from JWT.
     * @param id             UUID of the challenge from route parameter.
     * @param dto            Submitted answer payload.
     * @param idempotencyKey Optional client-generated idempotency key.
     * @returns              Evaluation result with correct answer and XP update.
     */
    @Post("challenges/:id/attempt")
    @HttpCode(HttpStatus.OK)
    @SetRateLimit({ limit: 30, windowSeconds: 3600, scope: "user" })
    @UseGuards(RateLimitGuard)
    @ApiOperation({
        summary: "Submit a challenge attempt",
        description:
            "Evaluates the submitted answer against the correct answer. " +
            "Always returns the correct answer and explanation regardless of outcome. " +
            "A correct answer locks the challenge - no further attempts allowed. " +
            "Incorrect answers can be retried up to max_attempts (default 3) times total. " +
            "XP is awarded and badge evaluation is triggered asynchronously on correct answers. " +
            "Supports idempotent submission via the optional X-Idempotency-Key header: " +
            "same key + same body replays the cached response; " +
            "same key + different body returns 409. " +
            "Rate limited to 30 requests per hour per user.",
    })
    @ApiParam({
        name: "id",
        description: "UUID v7 of the challenge.",
        example: "019501a0-0000-7000-8000-000000000002",
    })
    @ApiHeader({
        name: "x-idempotency-key",
        description:
            "Optional client-generated UUID for idempotent submission. " +
            "Identical key + body replays the cached response. " +
            "Identical key + different body returns 409.",
        required: false,
        example: "019501a0-0000-7000-8000-000000000099",
    })
    @ApiResponse({
        status: 200,
        description: "Attempt evaluated successfully.",
        type: AttemptResultDto,
    })
    @ApiResponse({
        status: 400,
        description: "Validation failed - answer field missing or invalid.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized - invalid or expired token.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 404,
        description: "Challenge not found.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 409,
        description:
            "Already completed (answered correctly), or idempotency key reused with different body.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 429,
        description: "Max attempts reached or rate limit hit.",
        type: ApiErrorDto,
    })
    async submitAttempt(
        @CurrentUser("userId") userId: string,
        @Param("id") id: string,
        @Body() dto: SubmitAttemptDto,
        @Headers(IDEMPOTENCY_HEADER) idempotencyKey?: string,
    ): Promise<AttemptResultDto> {
        return this.challengesService.submitAttempt(
            userId,
            id,
            dto,
            idempotencyKey,
        );
    }

    // -------------------------------------------------------------------------
    // GET /challenges/:id/attempts/me
    // -------------------------------------------------------------------------

    /**
     * Returns the authenticated user's full attempt history for a challenge.
     *
     * @param userId  Authenticated user UUID from JWT.
     * @param id      UUID of the challenge from route parameter.
     * @returns       Attempt list with lock status and count.
     */
    @Get("challenges/:id/attempts/me")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: "Get my attempts for a challenge",
        description:
            "Returns the authenticated user's complete attempt history " +
            "for a single challenge, ordered oldest-first. " +
            "is_locked is true if the user answered correctly OR used all attempts.",
    })
    @ApiParam({
        name: "id",
        description: "UUID v7 of the challenge.",
        example: "019501a0-0000-7000-8000-000000000002",
    })
    @ApiResponse({
        status: 200,
        description: "Attempt history returned successfully.",
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized - invalid or expired token.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 404,
        description: "Challenge not found.",
        type: ApiErrorDto,
    })
    async getMyAttempts(
        @CurrentUser("userId") userId: string,
        @Param("id") id: string,
    ): Promise<{
        challenge_id: string;
        attempts: {
            id: string;
            submitted_answer: string;
            is_correct: boolean;
            attempted_at: string;
        }[];
        is_locked: boolean;
        attempts_used: number;
    }> {
        return this.challengesService.getMyAttempts(userId, id);
    }
}
