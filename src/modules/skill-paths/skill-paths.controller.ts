/**
 * @module modules/skill-paths/skill-paths.controller
 * @description
 * HTTP controller exposing all 9 Skill Paths endpoints.
 */

import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
} from "@nestjs/common";
import {
    ApiBearerAuth,
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from "@nestjs/swagger";

import { SkillPathsService } from "./skill-paths.service";

import { CreatePathDto } from "./dto/create-path.dto";
import { UpdatePathDto } from "./dto/update-path.dto";
import { PathQueryDto } from "./dto/path-query.dto";

import { PathResponseDto } from "./dto/path-response.dto";
import { PathListResponseDto } from "./dto/path-list-response.dto";
import { PathDetailResponseDto } from "./dto/path-detail-response.dto";
import { EnrolResponseDto } from "./dto/enrol-response.dto";
import { PathProgressResponseDto } from "./dto/path-progress-response.dto";
import { EnrolledPathsResponseDto } from "./dto/enrolled-paths-response.dto";

import { CurrentUser } from "@common/decorators/current-user.decorator";
import { Roles } from "@common/decorators/roles.decorator";
import { SetRateLimit } from "@common/guards/rate-limit.guard";

import { ApiErrorDto } from "@common/dto/api-error.dto";
import { MessageResponseDto } from "@common/dto/message-response.dto";

import { SKILL_PATH_RATE_LIMITS } from "./skill-paths.constants";

/**
 * Skill Paths controller - curated learning path browsing, enrolment,
 * progress tracking, and admin management.
 */
@ApiTags("Skill Paths")
@ApiBearerAuth("access-token")
@Controller("skill-paths")
export class SkillPathsController {
    constructor(private readonly skillPathsService: SkillPathsService) {}

    // =========================================================================
    // Static routes
    // =========================================================================

    /**
     * Return all published skill paths with the user's enrolment status merged in.
     * Optionally filtered by difficulty. Cursor-paginated.
     *
     * @param userId Authenticated user UUID from JWT context.
     * @param query  Difficulty, cursor, limit query params.
     * @returns Paginated path list with enrolment status per item.
     */
    @Get()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: "List published skill paths",
        description:
            "Returns all published paths with the requesting user's enrolment status " +
            "(is_enrolled, progress_count, status) merged into each item. " +
            "Optionally filtered by difficulty. Cursor-paginated on path ID.",
    })
    @ApiResponse({
        status: 200,
        description: "Path list returned.",
        type: PathListResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    async getPaths(
        @CurrentUser("userId") userId: string,
        @Query() query: PathQueryDto,
    ): Promise<PathListResponseDto> {
        return this.skillPathsService.getPaths(userId, query);
    }

    /**
     * Return all paths the authenticated user is enrolled in or has completed.
     * Ordered by enrolled_at DESC.
     *
     * @param userId Authenticated user UUID from JWT context.
     * @returns All enrolled paths with status and progress.
     */
    @Get("me/enrolled")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: "List enrolled paths",
        description:
            "Returns all skill paths the authenticated user is currently enrolled in " +
            "or has completed, ordered by most recently enrolled first.",
    })
    @ApiResponse({
        status: 200,
        description: "Enrolled paths returned.",
        type: EnrolledPathsResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    async getEnrolled(
        @CurrentUser("userId") userId: string,
    ): Promise<EnrolledPathsResponseDto> {
        return this.skillPathsService.getEnrolled(userId);
    }

    // =========================================================================
    // Admin routes
    // =========================================================================

    /**
     * Admin: create a new skill path with an ordered reel list.
     *
     * @param adminId UUID of the authenticated admin from JWT context.
     * @param dto     Validated creation payload.
     * @returns Minimal path response with created_at.
     */
    @Post()
    @HttpCode(HttpStatus.CREATED)
    @Roles("admin")
    @SetRateLimit(SKILL_PATH_RATE_LIMITS.ADMIN_WRITE)
    @ApiOperation({
        summary: "Admin - create skill path",
        description:
            "Creates a new skill path with the provided ordered reel list. " +
            "All reel IDs must exist and be in active status. " +
            "estimated_duration_minutes is computed automatically from reel durations. " +
            "Paths are unpublished (is_published=false) by default unless explicitly set. " +
            "Rate limited to 20 per hour.",
    })
    @ApiResponse({
        status: 201,
        description: "Skill path created.",
        type: PathResponseDto,
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
        status: 403,
        description: "Forbidden - admin only.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 422,
        description: "One or more reel IDs are invalid or not active.",
        type: ApiErrorDto,
    })
    async createPath(
        @CurrentUser("userId") adminId: string,
        @Body() dto: CreatePathDto,
    ): Promise<PathResponseDto> {
        return this.skillPathsService.createPath(adminId, dto);
    }

    // =========================================================================
    // Dynamic routes - /:id and sub-routes
    // =========================================================================

    /**
     * Return full path detail including ordered reel list with per-reel
     * completion status for the requesting user. Published paths only.
     *
     * @param userId  Authenticated user UUID from JWT context.
     * @param id      Skill path UUID from route parameter.
     * @returns Full path detail with reels and completion flags.
     */
    @Get(":id")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: "Get skill path detail",
        description:
            "Returns full path detail including the ordered reel list. " +
            "Each reel item includes is_completed for the requesting user. " +
            "Only published paths are accessible. Returns 404 for unpublished or deleted paths.",
    })
    @ApiParam({ name: "id", description: "Skill path UUID" })
    @ApiResponse({
        status: 200,
        description: "Path detail returned.",
        type: PathDetailResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 404,
        description: "Path not found or not published.",
        type: ApiErrorDto,
    })
    async getPathById(
        @CurrentUser("userId") userId: string,
        @Param("id", ParseUUIDPipe) id: string,
    ): Promise<PathDetailResponseDto> {
        return this.skillPathsService.getPathById(userId, id);
    }

    /**
     * Enrol the authenticated user in a skill path.
     * Idempotent on re-enrol after completion: resets progress (no XP re-award).
     * Throws 409 if user is already in_progress.
     *
     * @param userId  Authenticated user UUID from JWT context.
     * @param id      Skill path UUID from route parameter.
     * @returns Enrolment confirmation.
     */
    @Post(":id/enrol")
    @HttpCode(HttpStatus.CREATED)
    @SetRateLimit(SKILL_PATH_RATE_LIMITS.ENROL)
    @ApiOperation({
        summary: "Enrol in a skill path",
        description:
            "Enrols the user in the specified path. " +
            "If already completed, re-enrols and resets progress (XP and badges are NOT re-awarded). " +
            "Returns 409 if the user is already in_progress. " +
            "Rate limited to 20 per hour.",
    })
    @ApiParam({ name: "id", description: "Skill path UUID" })
    @ApiResponse({
        status: 201,
        description: "Enrolled successfully.",
        type: EnrolResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 404,
        description: "Path not found or not published.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 409,
        description: "Already enrolled (in_progress).",
        type: ApiErrorDto,
    })
    async enrol(
        @CurrentUser("userId") userId: string,
        @Param("id", ParseUUIDPipe) id: string,
    ): Promise<EnrolResponseDto> {
        return this.skillPathsService.enrol(userId, id);
    }

    /**
     * Remove the authenticated user from a skill path.
     * Hard-deletes the enrolment and all progress records.
     *
     * @param userId  Authenticated user UUID from JWT context.
     * @param id      Skill path UUID from route parameter.
     * @returns Success message.
     */
    @Delete(":id/unenrol")
    @HttpCode(HttpStatus.OK)
    @SetRateLimit(SKILL_PATH_RATE_LIMITS.UNENROL)
    @ApiOperation({
        summary: "Unenrol from a skill path",
        description:
            "Removes the user's enrolment and all progress records for this path. " +
            "This is a clean-slate operation - all progress is permanently deleted. " +
            "Returns 404 if the user is not enrolled. " +
            "Rate limited to 10 per hour.",
    })
    @ApiParam({ name: "id", description: "Skill path UUID" })
    @ApiResponse({
        status: 200,
        description: "Unenrolled successfully.",
        type: MessageResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 404,
        description: "Path not found or user not enrolled.",
        type: ApiErrorDto,
    })
    async unenrol(
        @CurrentUser("userId") userId: string,
        @Param("id", ParseUUIDPipe) id: string,
    ): Promise<MessageResponseDto> {
        return this.skillPathsService.unenrol(userId, id);
    }

    /**
     * Return the authenticated user's detailed progress on a specific path.
     * Throws NotEnrolledException (404) if not enrolled.
     *
     * @param userId  Authenticated user UUID from JWT context.
     * @param id      Skill path UUID from route parameter.
     * @returns Detailed progress with percentage, next_reel, and certificate_url.
     */
    @Get(":id/progress")
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: "Get progress on a skill path",
        description:
            "Returns the user's current progress on the specified path. " +
            "Includes progress_count, percentage (0-100), next_reel to watch, " +
            "and certificate_url after first completion. " +
            "Returns 404 if not enrolled (distinct from path not found).",
    })
    @ApiParam({ name: "id", description: "Skill path UUID" })
    @ApiResponse({
        status: 200,
        description: "Progress returned.",
        type: PathProgressResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 404,
        description: "Path not found/unpublished, or user not enrolled.",
        type: ApiErrorDto,
    })
    async getProgress(
        @CurrentUser("userId") userId: string,
        @Param("id", ParseUUIDPipe) id: string,
    ): Promise<PathProgressResponseDto> {
        return this.skillPathsService.getProgress(userId, id);
    }

    /**
     * Admin: partially update a skill path.
     * If reel_ids is provided, atomically replaces the full reel list.
     *
     * @param adminId  UUID of the authenticated admin from JWT context.
     * @param id       Skill path UUID from route parameter.
     * @param dto      Partial update payload.
     * @returns Updated path with updated_at.
     */
    @Patch(":id")
    @HttpCode(HttpStatus.OK)
    @Roles("admin")
    @SetRateLimit(SKILL_PATH_RATE_LIMITS.ADMIN_WRITE)
    @ApiOperation({
        summary: "Admin - update skill path",
        description:
            "Partially updates a skill path. All fields are optional. " +
            "reel_ids, when provided, REPLACES the entire reel list atomically. " +
            "Toggling is_published=true makes the path visible to users. " +
            "Rate limited to 20 per hour.",
    })
    @ApiParam({ name: "id", description: "Skill path UUID" })
    @ApiResponse({
        status: 200,
        description: "Skill path updated.",
        type: PathResponseDto,
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
        status: 403,
        description: "Forbidden - admin only.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 404,
        description: "Path not found.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 422,
        description: "One or more reel IDs are invalid or not active.",
        type: ApiErrorDto,
    })
    async updatePath(
        @CurrentUser("userId") adminId: string,
        @Param("id", ParseUUIDPipe) id: string,
        @Body() dto: UpdatePathDto,
    ): Promise<PathResponseDto> {
        return this.skillPathsService.updatePath(adminId, id, dto);
    }

    /**
     * Admin: soft-delete a skill path.
     * Existing enrolments are preserved as historical records.
     * The path becomes unreachable via all user-facing endpoints immediately.
     *
     * @param adminId UUID of the authenticated admin from JWT context.
     * @param id      Skill path UUID from route parameter.
     * @returns Success message.
     */
    @Delete(":id")
    @HttpCode(HttpStatus.OK)
    @Roles("admin")
    @SetRateLimit(SKILL_PATH_RATE_LIMITS.ADMIN_WRITE)
    @ApiOperation({
        summary: "Admin - delete skill path",
        description:
            "Soft-deletes a skill path (sets deleted_at). The path is immediately " +
            "removed from all user-facing endpoints. Existing enrolment rows are " +
            "preserved as historical records but become unreachable. " +
            "Rate limited to 20 per hour.",
    })
    @ApiParam({ name: "id", description: "Skill path UUID" })
    @ApiResponse({
        status: 200,
        description: "Skill path deleted.",
        type: MessageResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 403,
        description: "Forbidden - admin only.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 404,
        description: "Path not found.",
        type: ApiErrorDto,
    })
    async deletePath(
        @CurrentUser("userId") adminId: string,
        @Param("id", ParseUUIDPipe) id: string,
    ): Promise<MessageResponseDto> {
        return this.skillPathsService.deletePath(adminId, id);
    }
}
