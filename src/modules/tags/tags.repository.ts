/**
 * @module modules/tags/tags.repository
 * @description
 * Data-access layer for the Tags module. Combines PostgreSQL persistence
 * (raw SQL via DatabaseService) and Redis-backed cache storage
 * (via RedisService). No business logic lives here.
 *
 * All 11 methods documented in LLD Section 8 are implemented:
 *   DB:    findAll, findById, existsByName, existsByNameForOtherTag,
 *          create, update, getReelCountForTag, getReelCountsForTags
 *   Cache: getCachedTags, setCachedTags, invalidateTagCache
 */

import { Injectable } from "@nestjs/common";
import { DatabaseService } from "@database/database.service";
import { RedisService } from "@redis/redis.service";
import { Tag } from "./entities/tag.entity";
import { TAGS_CACHE_TTL, TAGS_REDIS_KEYS } from "./tags.constants";

/**
 * Shape of a tag enriched with its active-reel count.
 * Used internally by the cache layer and returned by getAllTags.
 */
export interface TagWithReelCount extends Tag {
    reel_count: number;
}

/**
 * Raw row returned by getReelCountsForTags bulk query.
 */
interface ReelCountRow extends Record<string, unknown> {
    tag_id: string;
    reel_count: string; // pg returns COUNT as string
}

/**
 * Shape passed to the create method.
 */
interface CreateTagData {
    id: string;
    name: string;
    category: string;
}

/**
 * Shape passed to the update method. Both fields are optional since PATCH
 * allows partial updates; undefined values fall through to COALESCE(null, col).
 */
interface UpdateTagData {
    name?: string;
    category?: string;
}

/**
 * Repository for tag persistence and cache management.
 */
@Injectable()
export class TagsRepository {
    /**
     * @param db  PostgreSQL database service.
     * @param redis Redis service for tag cache storage.
     */
    constructor(
        private readonly db: DatabaseService,
        private readonly redis: RedisService,
    ) {}

    // -------------------------------------------------------------------
    // DB methods 
    // -------------------------------------------------------------------

    /**
     * Return all tags, optionally filtered by category.
     * Results are ordered by category then name ascending.
     *
     * @param category Optional category filter. Pass undefined to return all tags.
     * @returns Array of Tag rows (may be empty).
     */
    async findAll(category?: string): Promise<Tag[]> {
        const result = await this.db.query<Tag>(
            `SELECT id, name, category, created_at, updated_at
             FROM tags
             WHERE ($1::text IS NULL OR category = $1)
             ORDER BY category, name ASC`,
            [category ?? null],
        );
        return result.rows;
    }

    /**
     * Fetch a single tag by its UUID primary key.
     *
     * @param id Tag UUID.
     * @returns Matching Tag or null if not found.
     */
    async findById(id: string): Promise<Tag | null> {
        const result = await this.db.query<Tag>(
            `SELECT id, name, category, created_at, updated_at
             FROM tags
             WHERE id = $1`,
            [id],
        );
        return result.rows[0] ?? null;
    }

    /**
     * Check whether any tag with the given name already exists.
     * Used on POST /tags before insertion.
     *
     * @param name Tag name to check (case-sensitive; names are stored lowercase).
     * @returns true if a tag with this name exists.
     */
    async existsByName(name: string): Promise<boolean> {
        const result = await this.db.query<{ exists: boolean }>(
            `SELECT EXISTS(
                SELECT 1 FROM tags WHERE name = $1
             ) AS exists`,
            [name],
        );
        return result.rows[0]?.exists ?? false;
    }

    /**
     * Check whether any tag *other than the specified tag* has the given name.
     * Used on PATCH /tags/:id to prevent false 409 when an admin submits
     * the tag's current name unchanged.
     *
     * @param name      Tag name to check.
     * @param excludeId UUID of the tag being updated (excluded from the check).
     * @returns true if a *different* tag already holds this name.
     */
    async existsByNameForOtherTag(
        name: string,
        excludeId: string,
    ): Promise<boolean> {
        const result = await this.db.query<{ exists: boolean }>(
            `SELECT EXISTS(
                SELECT 1 FROM tags
                WHERE name = $1 AND id != $2
             ) AS exists`,
            [name, excludeId],
        );
        return result.rows[0]?.exists ?? false;
    }

    /**
     * Insert a new tag row and return the created record.
     *
     * @param data Insertion payload containing id (uuidv7), name, and category.
     * @returns Newly created Tag entity.
     */
    async create(data: CreateTagData): Promise<Tag> {
        const result = await this.db.query<Tag>(
            `INSERT INTO tags (id, name, category, created_at, updated_at)
             VALUES ($1, $2, $3, now(), now())
             RETURNING id, name, category, created_at, updated_at`,
            [data.id, data.name, data.category],
        );
        return result.rows[0];
    }

    /**
     * Partially update a tag's name and/or category using COALESCE so that
     * omitted fields keep their current database values.
     * Always sets updated_at = now().
     *
     * @param id   UUID of the tag to update.
     * @param data Fields to update (undefined values are treated as no-op via COALESCE).
     * @returns Updated Tag entity with id, name, category, and updated_at.
     */
    async update(id: string, data: UpdateTagData): Promise<Tag> {
        const result = await this.db.query<Tag>(
            `UPDATE tags
             SET
                 name       = COALESCE($2, name),
                 category   = COALESCE($3, category),
                 updated_at = now()
             WHERE id = $1
             RETURNING id, name, category, created_at, updated_at`,
            [id, data.name ?? null, data.category ?? null],
        );
        return result.rows[0];
    }

    /**
     * Return the count of active, non-deleted reels tagged with a specific tag.
     * Returns 0 until the Reels module is built (reel_tags and reels tables empty).
     *
     * @param tagId Tag UUID.
     * @returns Number of active reels associated with this tag.
     */
    async getReelCountForTag(tagId: string): Promise<number> {
        const result = await this.db.query<{ count: string }>(
            `SELECT COUNT(*) AS count
             FROM reel_tags rt
             JOIN reels r ON r.id = rt.reel_id
             WHERE rt.tag_id = $1
               AND r.status = 'active'
               AND r.deleted_at IS NULL`,
            [tagId],
        );
        return parseInt(result.rows[0]?.count ?? "0", 10);
    }

    /**
     * Bulk-fetch active-reel counts for a list of tag IDs in a single query.
     * Tags with zero associated active reels are not included in the result
     * set - callers should default missing entries to 0.
     * Returns empty array until the Reels module is built.
     *
     * @param tagIds Array of tag UUIDs to count reels for.
     * @returns Array of { tag_id, reel_count } rows (only non-zero counts).
     */
    async getReelCountsForTags(
        tagIds: string[],
    ): Promise<Array<{ tag_id: string; reel_count: number }>> {
        if (tagIds.length === 0) return [];

        const result = await this.db.query<ReelCountRow>(
            `SELECT rt.tag_id, COUNT(*) AS reel_count
             FROM reel_tags rt
             JOIN reels r ON r.id = rt.reel_id
             WHERE rt.tag_id = ANY($1)
               AND r.status = 'active'
               AND r.deleted_at IS NULL
             GROUP BY rt.tag_id`,
            [tagIds],
        );

        // pg returns COUNT as a string - normalise to number here
        return result.rows.map((row) => ({
            tag_id: row.tag_id,
            reel_count: parseInt(row.reel_count, 10),
        }));
    }

    // -------------------------------------------------------------------
    // Cache methods
    // -------------------------------------------------------------------

    /**
     * Attempt a cache hit for the given key.
     * Returns the parsed list if cached, or null on a miss.
     *
     * @param cacheKey Redis key to look up (tags:all or tags:category:{category}).
     * @returns Parsed array of enriched tags, or null on cache miss.
     */
    async getCachedTags(cacheKey: string): Promise<TagWithReelCount[] | null> {
        const raw = await this.redis.get(cacheKey);
        if (raw === null) return null;

        try {
            return JSON.parse(raw) as TagWithReelCount[];
        } catch {
            // Corrupt cache entry - treat as miss
            return null;
        }
    }

    /**
     * Persist an enriched tag list to the cache under the given key.
     * TTL is fixed at TAGS_CACHE_TTL.TAGS_LIST (600 s).
     *
     * @param cacheKey Redis key to write to.
     * @param tags     Enriched tag list to serialise and store.
     */
    async setCachedTags(
        cacheKey: string,
        tags: TagWithReelCount[],
    ): Promise<void> {
        await this.redis.set(
            cacheKey,
            JSON.stringify(tags),
            TAGS_CACHE_TTL.TAGS_LIST,
        );
    }

    /**
     * Invalidate the tags:all key and one or more tags:category:{category} keys.
     * Called after every admin CREATE or PATCH to keep public reads consistent.
     *
     * @param categories Array of category slugs whose cache entries should be deleted.
     */
    async invalidateTagCache(categories: string[]): Promise<void> {
        const keysToDelete: string[] = [TAGS_REDIS_KEYS.ALL];

        for (const category of categories) {
            keysToDelete.push(`${TAGS_REDIS_KEYS.CATEGORY_PREFIX}:${category}`);
        }

        await this.redis.del(...keysToDelete);
    }
}
