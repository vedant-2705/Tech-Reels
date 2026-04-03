/**
 * @module modules/tags/tags.service.abstract
 * @description
 * Abstract class contract for the tags catalogue service.
 *
 * Controllers depend on this abstract class.  DI is wired in TagsModule
 * so `TagsService` (token) resolves to `TagsServiceImpl` (concrete class).
 */

import { CreateTagDto } from "./dto/create-tag.dto";
import { UpdateTagDto } from "./dto/update-tag.dto";
import { TagListResponseDto, TagResponseDto } from "./dto/tag-response.dto";

export abstract class TagsService {
    /** Return all tags, optionally filtered by category.
     * 
     * @param category Optional category filter (e.g. 'frontend', 'devops').
     * @returns Paginated tag list with per-tag reel counts and total meta.
     */
    abstract getAllTags(category?: string): Promise<TagListResponseDto>;

    /** Return a single tag by ID.
     * 
     * @param id Tag UUID.
     * @returns Full tag detail DTO with reel_count and created_at.
     * @throws TagNotFoundException if no tag exists with this ID.
     */
    abstract getTagById(id: string): Promise<TagResponseDto>;

    /** Create a new tag.
     * 
     * @param dto Validated creation payload (name, category).
     * @returns Created tag DTO with id, name, category, and created_at.
     * @throws TagConflictException if a tag with this name already exists.
     */
    abstract createTag(dto: CreateTagDto): Promise<TagResponseDto>;

    /** Update mutable tag fields.
     * 
     * @param id  Tag UUID to update.
     * @param dto Validated partial update payload (name and/or category optional).
     * @returns Updated tag DTO with id, name, category, and updated_at.
     * @throws TagNotFoundException    if no tag exists with this ID.
     * @throws TagConflictException    if dto.name is already held by a different tag.
     */
    abstract updateTag(id: string, dto: UpdateTagDto): Promise<TagResponseDto>;
}
