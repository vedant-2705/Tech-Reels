/**
 * @module modules/reels/reels.mapper
 * @description
 * Pure mapping functions shared by the ReelsService facade and all sub-services.
 * Centralises the Reel entity → ReelResponseDto / ReelMeta → ReelResponseDto
 * transforms so no sub-service duplicates the shape logic.
 *
 * All functions are stateless - no dependency injection required.
 */

import { Logger } from "@nestjs/common";
import { Reel, ReelMeta } from "./entities/reel.entity";
import { ReelResponseDto } from "./dto/reel-response.dto";

const logger = new Logger("ReelsMapper");

/**
 * Map a full Reel entity (from DB) to the public ReelResponseDto shape.
 *
 * @param reel Reel entity from DB.
 * @returns ReelResponseDto.
 */
export function toReelResponseDto(reel: Reel): ReelResponseDto {
    return {
        id: reel.id,
        title: reel.title,
        description: reel.description,
        hls_path: reel.hls_path,
        thumbnail_key: reel.thumbnail_key,
        duration_seconds: reel.duration_seconds,
        status: reel.status,
        difficulty: reel.difficulty,
        view_count: Number(reel.view_count),
        like_count: Number(reel.like_count),
        save_count: Number(reel.save_count),
        share_count: Number(reel.share_count),
        creator: {
            id: reel.creator_id,
            username: reel.username,
            avatar_url: reel.avatar_url,
        },
        tags: Array.isArray(reel.tags) ? reel.tags : [],
        created_at: reel.created_at,
        updated_at: reel.updated_at,
    };
}

/**
 * Map a Redis Hash ReelMeta to the public ReelResponseDto shape.
 * Parses stringified numeric fields from Redis storage.
 *
 * @param meta ReelMeta from Redis Hash.
 * @returns ReelResponseDto.
 */
export function metaToResponseDto(meta: ReelMeta): ReelResponseDto {
    let tags = [];
    try {
        tags = JSON.parse(meta.tags ?? "[]");
    } catch {
        logger.warn(
            `Failed to parse tags from cache for reel ${meta.id}`,
        );
    }

    return {
        id: meta.id,
        title: meta.title,
        description: meta.description || null,
        hls_path: meta.hls_path || null,
        thumbnail_key: meta.thumbnail_key || null,
        duration_seconds: meta.duration_seconds
            ? parseInt(meta.duration_seconds, 10)
            : null,
        status: meta.status,
        difficulty: meta.difficulty,
        view_count: parseInt(meta.view_count, 10),
        like_count: parseInt(meta.like_count, 10),
        save_count: parseInt(meta.save_count, 10),
        share_count: parseInt(meta.share_count, 10),
        creator: {
            id: meta.creator_id,
            username: meta.username,
            avatar_url: meta.avatar_url || null,
        },
        tags,
        created_at: meta.created_at,
        updated_at: meta.updated_at,
    };
}
