/**
 * @module modules/tags/tags.controller
 * @description
 * Controller exposing the Tags catalogue API. Provides two public read
 * endpoints and two admin-only write endpoints.
 *
 * Guard summary:
 *   GET  /tags        - @SkipAuth() (public, no JWT)
 *   GET  /tags/:id    - @SkipAuth() (public, no JWT)
 *   POST /tags        - JWT (global) + @Roles('admin') + RateLimitGuard
 *   PATCH /tags/:id   - JWT (global) + @Roles('admin') + RateLimitGuard
 */

import {
    Body,
    Controller,
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

import { TagsService } from "./tags.service.abstract";
import { CreateTagDto } from "./dto/create-tag.dto";
import { UpdateTagDto } from "./dto/update-tag.dto";
import { TagListResponseDto, TagResponseDto } from "./dto/tag-response.dto";

import { SkipAuth } from "@common/decorators/skip-auth.decorator";
import { Roles } from "@common/decorators/roles.decorator";
import { SetRateLimit } from "@common/guards/rate-limit.guard";
import { RateLimitGuard } from "@common/guards/rate-limit.guard";
import { ApiErrorDto } from "@common/dto/api-error.dto";
import { TAG_CATEGORIES, TAGS_RATE_LIMITS } from "./tags.constants";

/**
 * Thin transport layer for tag catalogue operations.
 */
@ApiTags("Tags")
@Controller("tags")
export class TagsController {
    /**
     * @param tagsService Tags application service.
     */
    constructor(private readonly tagsService: TagsService) {}

    /**
     * Return all tags in the catalogue, optionally filtered by category.
     * Results are cached for 10 minutes (Redis TTL 600 s).
     *
     * @param category Optional category query parameter.
     * @returns Paginated tag list with per-tag reel counts and total meta.
     */
    @Get()
    @SkipAuth()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: "List all tags",
        description:
            "Returns the full tag catalogue, optionally filtered by category. " +
            "Results are cached for 10 minutes. " +
            "reel_count reflects active, non-deleted reels only. " +
            "No authentication required.",
    })
    @ApiQuery({
        name: "category",
        required: false,
        enum: TAG_CATEGORIES,
        description: "Filter tags by category.",
        example: "frontend",
    })
    @ApiResponse({
        status: 200,
        description: "Tag list returned successfully.",
        type: TagListResponseDto,
    })
    async getAllTags(
        @Query("category") category?: string,
    ): Promise<TagListResponseDto> {
        return this.tagsService.getAllTags(category);
    }

    /**
     * Return a single tag by its UUID, including reel count and timestamps.
     *
     * @param id Tag UUID (path parameter).
     * @returns Full tag detail with reel_count and created_at.
     */
    @Get(":id")
    @SkipAuth()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: "Get tag by ID",
        description:
            "Returns a single tag by UUID. " +
            "Includes reel_count (active reels only) and created_at timestamp. " +
            "No authentication required.",
    })
    @ApiParam({
        name: "id",
        description: "Tag UUID (v7).",
        example: "019501a0-1234-7abc-8def-000000000001",
    })
    @ApiResponse({
        status: 200,
        description: "Tag returned successfully.",
        type: TagResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: "Tag not found.",
        type: ApiErrorDto,
    })
    async getTagById(@Param("id") id: string): Promise<TagResponseDto> {
        return this.tagsService.getTagById(id);
    }

    /**
     * Create a new tag in the admin-managed catalogue.
     * Requires admin role. Rate-limited to 20 write operations per hour per user.
     *
     * @param dto Validated tag creation payload.
     * @returns Created tag with id, name, category, and created_at.
     */
    @Post()
    @Roles("admin")
    @SetRateLimit(TAGS_RATE_LIMITS.WRITE)
    @UseGuards(RateLimitGuard)
    @HttpCode(HttpStatus.CREATED)
    @ApiBearerAuth("access-token")
    @ApiOperation({
        summary: "Create a new tag",
        description:
            "Admin only. Creates a new tag in the catalogue. " +
            "Tag names must be lowercase letters, numbers, and hyphens only, " +
            "and must be unique across all existing tags. " +
            "Invalidates the tags:all and tags:category:{category} cache entries.",
    })
    @ApiResponse({
        status: 201,
        description: "Tag created successfully.",
        type: TagResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: "Validation failed.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized - missing or invalid JWT.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 403,
        description: "Forbidden - authenticated user is not an admin.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 409,
        description: "A tag with this name already exists.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 429,
        description: "Write rate limit exceeded (20 / hr / user).",
        type: ApiErrorDto,
    })
    async createTag(@Body() dto: CreateTagDto): Promise<TagResponseDto> {
        return this.tagsService.createTag(dto);
    }

    /**
     * Update an existing tag's name and/or category.
     * Requires admin role. Rate-limited to 20 write operations per hour per user.
     * Publishes a TAG_UPDATED event to the content_events Pub/Sub channel
     * so downstream modules (e.g. Reels) can react.
     *
     * @param id  Tag UUID (path parameter).
     * @param dto Validated partial update payload.
     * @returns Updated tag with id, name, category, and updated_at.
     */
    @Patch(":id")
    @Roles("admin")
    @SetRateLimit(TAGS_RATE_LIMITS.WRITE)
    @UseGuards(RateLimitGuard)
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth("access-token")
    @ApiOperation({
        summary: "Update a tag",
        description:
            "Admin only. Updates a tag's name and/or category. " +
            "All fields are optional - only provided fields are changed. " +
            "Submitting the tag's current name does not raise a 409 conflict. " +
            "Invalidates relevant cache keys and publishes TAG_UPDATED to content_events.",
    })
    @ApiParam({
        name: "id",
        description: "Tag UUID (v7) of the tag to update.",
        example: "019501a0-1234-7abc-8def-000000000001",
    })
    @ApiResponse({
        status: 200,
        description: "Tag updated successfully.",
        type: TagResponseDto,
    })
    @ApiResponse({
        status: 400,
        description: "Validation failed.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 401,
        description: "Unauthorized - missing or invalid JWT.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 403,
        description: "Forbidden - authenticated user is not an admin.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 404,
        description: "Tag not found.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 409,
        description: "A different tag already holds this name.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 429,
        description: "Write rate limit exceeded (20 / hr / user).",
        type: ApiErrorDto,
    })
    async updateTag(
        @Param("id") id: string,
        @Body() dto: UpdateTagDto,
    ): Promise<TagResponseDto> {
        return this.tagsService.updateTag(id, dto);
    }
}
