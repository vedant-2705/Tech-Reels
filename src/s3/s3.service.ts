/**
 * @module s3/s3.service
 * @description
 * Thin wrapper around the AWS S3 SDK.
 * Exposes only the operations needed by TechReel:
 *   - generatePresignedPutUrl - for client-side direct uploads (avatars, videos)
 *   - objectExists             - to verify a client actually uploaded before DB update
 *
 * The server never handles file bytes directly. All uploads go
 * client → S3 presigned URL. This service only generates the URL and
 * verifies the upload completed.
 */

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
    S3Client,
    HeadObjectCommand,
    HeadObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";

export interface PresignedPutUrlOptions {
    /** S3 object key - e.g. avatars/{userId}/{uuid}.jpg */
    key: string;
    /** MIME type - e.g. image/jpeg */
    contentType: string;
    /** Max allowed upload size in bytes - enforced via S3 policy */
    maxSizeBytes: number;
    /** URL validity window in seconds - default 300 (5 minutes) */
    expiresIn?: number;
}

export interface PresignedPutUrlResult {
    /** The presigned PUT URL - client uploads directly to this */
    upload_url: string;
    /** ISO 8601 expiry timestamp */
    expires_at: string;
}

@Injectable()
export class S3Service {
    private readonly client: S3Client;
    private readonly cdnBucket: string;
    private readonly rawBucket: string;
    private readonly cdnBaseUrl: string;
    private readonly logger = new Logger(S3Service.name);

    constructor(private readonly config: ConfigService) {
        this.client = new S3Client({
            region: this.config.get<string>("AWS_REGION") ?? "us-east-1",
            credentials: {
                accessKeyId: this.config.get<string>("AWS_ACCESS_KEY_ID") ?? "",
                secretAccessKey:
                    this.config.get<string>("AWS_SECRET_ACCESS_KEY") ?? "",
            },
        });

        this.cdnBucket =
            this.config.get<string>("S3_CDN_BUCKET") ?? "techreel-cdn";
        this.rawBucket =
            this.config.get<string>("S3_RAW_BUCKET") ?? "techreel-raw";
        this.cdnBaseUrl =
            this.config.get<string>("CDN_BASE_URL") ??
            "https://cdn.techreel.io/";
    }

    /**
     * Generate a presigned S3 PUT URL for direct client uploads.
     * The URL is scoped to a specific key and content type.
     * Client must PUT the file within the expiry window.
     *
     * @param options - Upload configuration.
     * @param bucket  - Target bucket. Defaults to CDN bucket (avatars).
     * @returns Presigned URL and expiry timestamp.
     */
    async generatePresignedPutUrl(
        options: PresignedPutUrlOptions,
        bucket: string = this.cdnBucket,
    ): Promise<PresignedPutUrlResult> {
        const expiresIn = options.expiresIn ?? 300;

        const command = new PutObjectCommand({
            Bucket: bucket,
            Key: options.key,
            ContentType: options.contentType,
        });

        const upload_url = await getSignedUrl(this.client, command, {
            expiresIn,
        });

        const expires_at = new Date(
            Date.now() + expiresIn * 1000,
        ).toISOString();

        return { upload_url, expires_at };
    }

    /**
     * Check whether an object exists in S3 without downloading it.
     * Uses HeadObject - only fetches metadata, not the body.
     *
     * @param key    - S3 object key to check.
     * @param bucket - Bucket to check. Defaults to CDN bucket.
     * @returns true if the object exists, false otherwise.
     */
    async objectExists(
        key: string,
        bucket: string = this.cdnBucket,
    ): Promise<boolean> {
        try {
            const command = new HeadObjectCommand({ Bucket: bucket, Key: key });
            const result: HeadObjectCommandOutput =
                await this.client.send(command);
            return result.$metadata.httpStatusCode === 200;
        } catch (err: unknown) {
            // HeadObject throws NotFound (404) or NoSuchKey when the object doesn't exist
            const code = (err as { name?: string })?.name;
            if (code === "NotFound" || code === "NoSuchKey") {
                return false;
            }
            // Unexpected error - log and rethrow
            this.logger.error(`S3 HeadObject failed for key "${key}":`, err);
            throw err;
        }
    }

    /**
     * Build the full CDN URL for a given S3 key.
     *
     * @param key - S3 object key.
     * @returns Full CDN URL string.
     */
    getCdnUrl(key: string): string {
        const base = this.cdnBaseUrl.endsWith("/")
            ? this.cdnBaseUrl
            : `${this.cdnBaseUrl}/`;
        return `${base}${key}`;
    }

    /**
     * Derive the file extension from a MIME type.
     *
     * @param mimeType - e.g. 'image/jpeg'
     * @returns Extension string e.g. 'jpg'
     */
    static extensionFromMimeType(mimeType: string): string {
        const map: Record<string, string> = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "video/mp4": "mp4",
        };
        return map[mimeType] ?? mimeType.split("/")[1] ?? "bin";
    }
}
