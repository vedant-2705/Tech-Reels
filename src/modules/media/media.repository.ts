/**
 * @module modules/media/media.repository
 * @description
 * Data-access layer for the Media module. Performs raw SQL reads and writes
 * exclusively on the `reels` table. Does not own any cache logic - cache
 * invalidation is handled in MediaService after repository calls succeed.
 *
 * All SQL uses parameterized queries ($1, $2, ...). No ORM. No string
 * interpolation in query text.
 */

import { Injectable } from "@nestjs/common";
import { DatabaseService } from "@database/database.service";

/**
 * Payload shape for updating a reel to `active` status after MediaConvert
 * job completes successfully.
 */
export interface ProcessingCompleteData {
    /** S3 key of the HLS master playlist in techreel-cdn. */
    hls_path: string;
    /** S3 key of the generated thumbnail in techreel-cdn. */
    thumbnail_key: string;
    /** Duration of the transcoded video in whole seconds. */
    duration_seconds: number;
}

/**
 * Repository for Media module - writes processing results to the reels table.
 */
@Injectable()
export class MediaRepository {
    /**
     * @param db DatabaseService pg Pool wrapper.
     */
    constructor(private readonly db: DatabaseService) {}

    /**
     * Sets a reel's status to `active` and persists HLS output metadata
     * after a successful MediaConvert job.
     *
     * @param reelId UUID of the reel being updated.
     * @param data   HLS path, thumbnail key, and duration from MediaConvert output.
     * @returns void
     */
    async markComplete(
        reelId: string,
        data: ProcessingCompleteData,
    ): Promise<void> {
        await this.db.query(
            `UPDATE reels
                SET status           = 'active',
                    hls_path         = $2,
                    thumbnail_key    = $3,
                    duration_seconds = $4,
                    updated_at       = now()
              WHERE id = $1
                AND deleted_at IS NULL`,
            [reelId, data.hls_path, data.thumbnail_key, data.duration_seconds],
        );
    }

    /**
     * Sets a reel's status to `failed` after a MediaConvert job error.
     *
     * @param reelId UUID of the reel being updated.
     * @returns void
     */
    async markFailed(reelId: string): Promise<void> {
        await this.db.query(
            `UPDATE reels
                SET status     = 'failed',
                    updated_at = now()
              WHERE id = $1
                AND deleted_at IS NULL`,
            [reelId],
        );
    }
}
