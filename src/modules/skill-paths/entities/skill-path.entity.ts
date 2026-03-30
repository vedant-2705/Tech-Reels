/**
 * @module modules/skill-paths/entities/skill-path.entity
 * @description
 * Plain TypeScript interfaces representing DB row shapes returned by the
 * SkillPathsRepository. No ORM decorators - raw query results are cast to
 * these types directly (same pattern as challenge.entity.ts and reel.entity.ts).
 *
 * These are internal types used between repository and service.
 * DTOs in the dto/ directory define the public API shapes.
 */

// ---------------------------------------------------------------------------
// Core path row
// ---------------------------------------------------------------------------

/**
 * Full skill_paths table row as returned by findById.
 * Used for admin operations and cache storage.
 */
export interface SkillPath extends Record<string, unknown> {
    id: string;
    title: string;
    description: string;
    difficulty: string;
    /** Full URL stored directly - admin-provided cover image. Not an S3 key. */
    thumbnail_url: string | null;
    total_reels: number;
    estimated_duration_minutes: number;
    is_published: boolean;
    created_by: string;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
}

// ---------------------------------------------------------------------------
// Path reel (joined row from getPathReels)
// ---------------------------------------------------------------------------

/**
 * Single reel entry within a skill path as returned by getPathReels.
 * Joins skill_path_reels -> reels -> reel_tags -> tags.
 *
 * thumbnail_key: raw S3 key from reels.thumbnail_key.
 * The service converts this to a full URL using CDN_BASE_URL before
 * returning it to the client. The repository never performs this conversion.
 */
export interface PathReel extends Record<string, unknown> {
    /** Position in the path (1-indexed). */
    order: number;
    id: string;
    title: string;
    difficulty: string;
    /** Raw S3 key - must be converted to URL by service before returning to client. */
    thumbnail_key: string | null;
    /** Duration in seconds from reels.duration_seconds. */
    duration: number;
    /** Aggregated tag names for display. */
    tags: { name: string }[];
}

// ---------------------------------------------------------------------------
// Enrolment row
// ---------------------------------------------------------------------------

/**
 * Full user_skill_paths row as returned by getEnrolment.
 * Used internally for progress checks, re-enrol logic, and completion gating.
 */
export interface Enrolment extends Record<string, unknown> {
    user_id: string;
    path_id: string;
    /** 'in_progress' | 'completed' */
    status: string;
    /** Denormalised count of reels completed in this path. */
    progress_count: number;
    certificate_url: string | null;
    enrolled_at: string;
    completed_at: string | null;
    updated_at: string;
}

// ---------------------------------------------------------------------------
// Enrolled path (joined row from findEnrolledByUser)
// ---------------------------------------------------------------------------

/**
 * Joined result of user_skill_paths + skill_paths for the
 * GET /skill-paths/me/enrolled endpoint.
 */
export interface EnrolledPath extends Record<string, unknown> {
    path_id: string;
    title: string;
    difficulty: string;
    thumbnail_url: string | null;
    status: string;
    progress_count: number;
    total_reels: number;
    enrolled_at: string;
    completed_at: string | null;
}

// ---------------------------------------------------------------------------
// Next reel (used in getProgress response)
// ---------------------------------------------------------------------------

/**
 * Minimal reel shape for the next_reel field in PathProgressResponseDto.
 * Returns only what the client needs to navigate to the next video.
 */
export interface NextReel extends Record<string, unknown> {
    order: number;
    id: string;
    title: string;
}

// ---------------------------------------------------------------------------
// Subscriber query result
// ---------------------------------------------------------------------------

/**
 * Row returned by getEnrolledPathIdsForReel.
 * Used by VideoTelemetrySubscriber to determine which paths to update
 * when a REEL_WATCH_ENDED event fires.
 *
 * Includes progress_count and completed_at so the subscriber can compute
 * new_count and isFirstCompletion without extra DB round-trips.
 */
export interface EnrolledPathForReel extends Record<string, unknown> {
    path_id: string;
    total_reels: number;
    /** Current progress before the new watch event is applied. */
    progress_count: number;
    /** null if the user has never completed this path before. */
    completed_at: string | null;
    /** Path title - used in the completion notification job payload. */
    path_title: string;
}

// ---------------------------------------------------------------------------
// Partial update shapes (passed to repository write methods)
// ---------------------------------------------------------------------------

/**
 * Partial data for updateEnrolment.
 * Only fields provided will be updated (COALESCE in SQL).
 * Mirrors the UpdateChallengeData pattern from challenge.entity.ts.
 */
export interface UpdateEnrolmentData {
    status?: string;
    progress_count?: number;
    completed_at?: string | null;
    certificate_url?: string | null;
}

/**
 * Partial data for updatePath.
 * Only fields provided will be updated (COALESCE in SQL).
 */
export interface UpdatePathData {
    title?: string;
    description?: string;
    difficulty?: string;
    thumbnail_url?: string | null;
    is_published?: boolean;
    total_reels?: number;
    estimated_duration_minutes?: number;
}

/**
 * Full data required to insert a new skill path row.
 */
export interface InsertPathData {
    id: string;
    title: string;
    description: string;
    difficulty: string;
    thumbnail_url: string | null;
    total_reels: number;
    estimated_duration_minutes: number;
    is_published: boolean;
    created_by: string;
}
