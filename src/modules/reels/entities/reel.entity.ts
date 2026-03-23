/**
 * @module modules/reels/entities/reel.entity
 * @description
 * TypeScript entity representing a row from the reels table, joined with
 * creator info and aggregated tag objects. Used as the return type for all
 * repository read methods.
 */

import { ReelDifficulty, ReelStatus } from "../reels.constants";

/**
 * Lightweight tag shape returned inside reel join queries.
 */
export interface ReelTag extends Record<string, unknown> {
    id: string;
    name: string;
    category: string;
}

/**
 * Creator snapshot embedded in reel query results.
 */
export interface ReelCreator {
    id: string;
    username: string;
    avatar_url: string | null;
}

/**
 * Full reel entity returned by repository methods.
 * Includes joined creator fields and aggregated tags array.
 */
export interface Reel extends Record<string, unknown> {
    id: string;
    creator_id: string;
    title: string;
    description: string | null;
    hls_path: string | null;
    thumbnail_key: string | null;
    duration_seconds: number | null;
    status: ReelStatus;
    difficulty: ReelDifficulty;
    view_count: number;
    like_count: number;
    save_count: number;
    share_count: number;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;

    /** Joined from users table. Present on findById / findByCreator / findActive. */
    username: string;
    /** Joined from users table. */
    avatar_url: string | null;
    /** Aggregated from reel_tags JOIN tags. Empty array when no tags. */
    tags: ReelTag[];
}

/**
 * Minimal reel shape returned by updateStatus (admin endpoint).
 */
export interface ReelStatusUpdate extends Record<string, unknown> {
    id: string;
    status: ReelStatus;
    updated_at: string;
}

/**
 * Shape stored in / returned from the reel:meta:{reelId} Redis Hash.
 * All numeric fields are stored as strings in Redis and parsed on read.
 */
export interface ReelMeta {
    id: string;
    title: string;
    description: string | null;
    hls_path: string | null;
    thumbnail_key: string | null;
    duration_seconds: string | null;
    status: ReelStatus;
    difficulty: ReelDifficulty;
    view_count: string;
    like_count: string;
    save_count: string;
    share_count: string;
    creator_id: string;
    username: string;
    avatar_url: string | null;
    /** JSON-encoded ReelTag[] */
    tags: string;
    created_at: string;
    updated_at: string;
}
