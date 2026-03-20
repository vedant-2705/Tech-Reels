/**
 * @module modules/tags/tags.service
 * @description
 * Application service for the Tags module. Coordinates persistence, cache,
 * and Pub/Sub side effects for the admin-managed tag catalogue.
 *
 * Read paths are cache-first (Redis -> DB -> cache write).
 * Write paths invalidate the relevant cache keys and, for PATCH, publish a
 * TAG_UPDATED event to the content_events Pub/Sub channel so the Reels
 * module can react.
 */

import { Injectable } from "@nestjs/common";
import { RedisService } from "@redis/redis.service";
import { TagsRepository } from "./tags.repository";
import { CreateTagDto } from "./dto/create-tag.dto";
import { UpdateTagDto } from "./dto/update-tag.dto";
import { TagListResponseDto, TagResponseDto } from "./dto/tag-response.dto";
import { TagNotFoundException } from "./exceptions/tag-not-found.exception";
import { TagConflictException } from "./exceptions/tag-conflict.exception";
import { uuidv7 } from "@common/utils/uuidv7.util";
import { TAGS_MODULE_CONSTANTS, TAGS_REDIS_KEYS } from "./tags.constants";

/**
 * Handles all business logic for tag catalogue reads and admin writes.
 */
@Injectable()
export class TagsService {
    /**
     * @param tagsRepository Tag persistence and cache repository.
     * @param redis          Redis client used for Pub/Sub publishing.
     */
    constructor(
        private readonly tagsRepository: TagsRepository,
        private readonly redis: RedisService,
    ) {}

    /**
     * Return all tags, optionally filtered by category.
     * Results are served from cache when available (TTL 600 s).
     * On a cache miss the DB is queried, reel counts are merged in a single
     * bulk query, and the result is written back to cache before returning.
     *
     * @param category Optional category filter (e.g. 'frontend', 'devops').
     * @returns Paginated tag list with per-tag reel counts and total meta.
     */
    async getAllTags(category?: string): Promise<TagListResponseDto> {
        const cacheKey = category
            ? `${TAGS_REDIS_KEYS.CATEGORY_PREFIX}:${category}`
            : TAGS_REDIS_KEYS.ALL;

        // 1. Cache hit - return immediately without touching the DB
        const cached = await this.tagsRepository.getCachedTags(cacheKey);
        if (cached !== null) {
            return {
                data: cached.map((t) => ({
                    id: t.id,
                    name: t.name,
                    category: t.category,
                    reel_count: t.reel_count,
                })),
                meta: { total: cached.length },
            };
        }

        // 2. Cache miss - fetch from DB
        const tags = await this.tagsRepository.findAll(category);

        // 3. Bulk-fetch reel counts for all returned tags in one query
        const reelCountRows = await this.tagsRepository.getReelCountsForTags(
            tags.map((t) => t.id),
        );

        // Build a map for O(1) lookup when merging
        const reelCountMap = new Map<string, number>(
            reelCountRows.map((r) => [r.tag_id, r.reel_count]),
        );

        // 4. Merge reel_count into each tag (default 0 when not in map)
        const enriched = tags.map((tag) => ({
            ...tag,
            reel_count: reelCountMap.get(tag.id) ?? 0,
        }));

        // 5. Write back to cache
        await this.tagsRepository.setCachedTags(cacheKey, enriched);

        // 6. Return response envelope
        return {
            data: enriched.map((t) => ({
                id: t.id,
                name: t.name,
                category: t.category,
                reel_count: t.reel_count,
            })),
            meta: { total: enriched.length },
        };
    }

    /**
     * Return a single tag by its UUID, including reel count and timestamps.
     * This endpoint is not cached - single-tag lookups are infrequent and
     * including created_at breaks the shared list cache shape.
     *
     * @param id Tag UUID.
     * @returns Full tag detail DTO with reel_count and created_at.
     * @throws TagNotFoundException if no tag exists with this ID.
     */
    async getTagById(id: string): Promise<TagResponseDto> {
        // 1. Fetch tag - throws if not found
        const tag = await this.tagsRepository.findById(id);
        if (tag === null) {
            throw new TagNotFoundException();
        }

        // 2. Fetch reel count separately (always 0 until Reels module built)
        const reelCount = await this.tagsRepository.getReelCountForTag(id);

        // 3. Return DTO
        return {
            id: tag.id,
            name: tag.name,
            category: tag.category,
            reel_count: reelCount,
            created_at: tag.created_at.toISOString(),
        };
    }

    /**
     * Create a new tag in the admin-managed catalogue.
     * Validates name uniqueness before insertion.
     * Invalidates the tags:all and tags:category:{dto.category} cache keys.
     *
     * @param dto Validated creation payload (name, category).
     * @returns Created tag DTO with id, name, category, and created_at.
     * @throws TagConflictException if a tag with this name already exists.
     */
    async createTag(dto: CreateTagDto): Promise<TagResponseDto> {
        // 1. Uniqueness check
        const nameExists = await this.tagsRepository.existsByName(dto.name);
        if (nameExists) {
            throw new TagConflictException();
        }

        // 2. Persist
        const tag = await this.tagsRepository.create({
            id: uuidv7(),
            name: dto.name,
            category: dto.category,
        });

        // 3. Invalidate list cache for all-tags and this category
        await this.tagsRepository.invalidateTagCache([dto.category]);

        // 4. Return DTO
        return {
            id: tag.id,
            name: tag.name,
            category: tag.category,
            created_at: tag.created_at.toISOString(),
        };
    }

    /**
     * Update an existing tag's name and/or category.
     * Uses an ownership-aware uniqueness check to prevent false 409 when
     * an admin submits the tag's current name unchanged.
     * Invalidates the relevant cache keys and publishes TAG_UPDATED to
     * the content_events Pub/Sub channel (fire-and-forget).
     *
     * @param id  Tag UUID to update.
     * @param dto Validated partial update payload (name and/or category optional).
     * @returns Updated tag DTO with id, name, category, and updated_at.
     * @throws TagNotFoundException    if no tag exists with this ID.
     * @throws TagConflictException    if dto.name is already held by a different tag.
     */
    async updateTag(id: string, dto: UpdateTagDto): Promise<TagResponseDto> {
        // 1. Fetch existing tag - throws if not found
        const existingTag = await this.tagsRepository.findById(id);
        if (existingTag === null) {
            throw new TagNotFoundException();
        }

        // 2. Ownership-aware name uniqueness check
        //    Skipped if no new name is being submitted.
        if (dto.name !== undefined) {
            const takenByOther =
                await this.tagsRepository.existsByNameForOtherTag(dto.name, id);
            if (takenByOther) {
                throw new TagConflictException();
            }
        }

        // 3. Persist changes (COALESCE in repository - omitted fields unchanged)
        const updated = await this.tagsRepository.update(id, {
            name: dto.name,
            category: dto.category,
        });

        // 4. Collect all categories whose cache entries must be invalidated:
        //    Always invalidate the old category.
        //    If the category changed, also invalidate the new one.
        const categoriesToInvalidate: string[] = [existingTag.category];
        if (
            dto.category !== undefined &&
            dto.category !== existingTag.category
        ) {
            categoriesToInvalidate.push(dto.category);
        }
        await this.tagsRepository.invalidateTagCache(categoriesToInvalidate);

        // 5. Publish TAG_UPDATED to content_events - fire-and-forget
        //    The Reels module subscribes to this event for its own cache cleanup.
        void this.redis.publish(
            TAGS_MODULE_CONSTANTS.CONTENT_EVENTS_CHANNEL,
            JSON.stringify({
                event: TAGS_MODULE_CONSTANTS.TAG_UPDATED,
                tagId: id,
                oldName: existingTag.name,
                newName: dto.name ?? existingTag.name,
                oldCategory: existingTag.category,
                newCategory: dto.category ?? existingTag.category,
                timestamp: new Date().toISOString(),
            }),
        );

        // 6. Return DTO
        return {
            id: updated.id,
            name: updated.name,
            category: updated.category,
            updated_at: updated.updated_at.toISOString(),
        };
    }
}
