/**
 * @module modules/messaging/messaging.registry
 * @description
 * Merges all module messaging manifests into the two flat lookup maps
 * used by MessagingService at runtime.
 *
 * Rules:
 *   - This file imports manifests, never individual job/event strings.
 *   - Adding a new route = edit the relevant module's *.messaging.ts file.
 *   - Adding a new module = add one import + one merge call here.
 *   - Duplicate job name strings across modules that target DIFFERENT queues
 *     will throw at startup (detected by buildJobRegistry).
 *   - Duplicate event type strings across modules that target DIFFERENT channels
 *     will throw at startup (detected by buildEventRegistry).
 */

import { ModuleMessagingManifest } from "./messaging.types";

// ---------------------------------------------------------------------------
// Module manifest imports
// One import per module that publishes jobs or events.
// Pure subscribers (Feed) are not listed here - they have no manifest.
// ---------------------------------------------------------------------------

import { AUTH_MANIFEST } from "@modules/auth/auth.messaging";
import { USERS_MANIFEST } from "@modules/users/users.messaging";
import { REELS_MANIFEST } from "@modules/reels/reels.messaging";
import { FEED_MANIFEST } from "@modules/feed/feed.messaging";
import { GAMIFICATION_MANIFEST } from "@modules/gamification/gamification.messaging";
import { CHALLENGES_MANIFEST } from "@modules/challenges/challenges.messaging";
import { SKILL_PATHS_MANIFEST } from "@modules/skill-paths/skill-paths.messaging";
import { NOTIFICATION_MANIFEST } from "@modules/notification/notification.messaging";
import { TAGS_MANIFEST } from "@modules/tags/tags.messaging";
import { MEDIA_MANIFEST } from "@modules/media/media.messaging";
import { ADMIN_MANIFEST } from "@modules/admin/admin.messaging";

// ---------------------------------------------------------------------------
// Registry builders
// ---------------------------------------------------------------------------

/**
 * Merges all manifest job entries into a flat jobName -> queueName map.
 * Throws on duplicate job name strings targeting different queues -
 * that is a routing ambiguity that must be resolved at the manifest level.
 */
function buildJobRegistry(
    ...manifests: ModuleMessagingManifest[]
): Readonly<Record<string, string>> {
    const registry: Record<string, string> = {};

    for (const manifest of manifests) {
        if (!manifest.jobs) continue;

        for (const [key, entry] of Object.entries(manifest.jobs)) {
            const existing = registry[entry.jobName];
            if (existing && existing !== entry.queue) {
                throw new Error(
                    `MessagingRegistry: Job name collision - ` +
                        `"${entry.jobName}" is registered to both ` +
                        `"${existing}" and "${entry.queue}". ` +
                        `Use a namespaced job name to disambiguate (e.g. "module:job_name").`,
                );
            }
            registry[entry.jobName] = entry.queue;
        }
    }

    return Object.freeze(registry);
}

/**
 * Merges all manifest event entries into a flat eventType -> channel map.
 * Throws on duplicate event type strings targeting different channels.
 */
function buildEventRegistry(
    ...manifests: ModuleMessagingManifest[]
): Readonly<Record<string, string>> {
    const registry: Record<string, string> = {};

    for (const manifest of manifests) {
        if (!manifest.events) continue;

        for (const [key, entry] of Object.entries(manifest.events)) {
            const existing = registry[entry.eventType];
            if (existing && existing !== entry.channel) {
                throw new Error(
                    `MessagingRegistry: Event type collision - ` +
                        `"${entry.eventType}" is registered to both ` +
                        `"${existing}" and "${entry.channel}". ` +
                        `Each event type string must map to exactly one channel.`,
                );
            }
            registry[entry.eventType] = entry.channel;
        }
    }

    return Object.freeze(registry);
}

// ---------------------------------------------------------------------------
// Exported registries
// Used by MessagingService.resolveQueue() and MessagingService.resolveChannel()
// ---------------------------------------------------------------------------

const ALL_MANIFESTS: ModuleMessagingManifest[] = [
    AUTH_MANIFEST,
    USERS_MANIFEST,
    REELS_MANIFEST,
    FEED_MANIFEST,
    GAMIFICATION_MANIFEST,
    CHALLENGES_MANIFEST,
    SKILL_PATHS_MANIFEST,
    NOTIFICATION_MANIFEST,
    TAGS_MANIFEST,
    MEDIA_MANIFEST,
    ADMIN_MANIFEST,
];

export const JOB_QUEUE_REGISTRY = buildJobRegistry(...ALL_MANIFESTS);
export const EVENT_CHANNEL_REGISTRY = buildEventRegistry(...ALL_MANIFESTS);
