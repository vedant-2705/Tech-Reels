/**
 * @module modules/messaging/messaging.types
 * @description
 * Type definitions for the module manifest pattern.
 *
 * Each feature module declares a ModuleMessagingManifest describing:
 *   - which jobs it dispatches and which queue they target
 *   - which events it publishes and which channel they target
 *
 * The registry merges all manifests into the two flat lookup maps that
 * MessagingService uses at runtime.
 */

// ---------------------------------------------------------------------------
// Manifest entry shapes
// ---------------------------------------------------------------------------

/**
 * Describes a single BullMQ job a module may dispatch.
 */
export interface JobManifestEntry {
    /** Exact string passed to queue.add(jobName, ...) and matched by the worker's switch. */
    readonly jobName: string;
    /** Physical queue name from QUEUES in src/queues/queue-names.ts. */
    readonly queue: string;
}

/**
 * Describes a single Redis Pub/Sub event a module may publish.
 */
export interface EventManifestEntry {
    /** Exact string stored in AppMessage.type - what subscribers route on. */
    readonly eventType: string;
    /** Physical Redis channel name from REDIS_CHANNELS. */
    readonly channel: string;
}

// ---------------------------------------------------------------------------
// Manifest shape
// ---------------------------------------------------------------------------

/**
 * A module's full messaging contract - everything it emits, nothing it receives.
 * Subscribers import the publisher's manifest for type-safe event type references.
 *
 * Both `jobs` and `events` are optional so pure-subscriber modules (Feed)
 * and queue-only modules (Notification) don't need to declare empty objects.
 */
export interface ModuleMessagingManifest {
    readonly jobs?: Readonly<Record<string, JobManifestEntry>>;
    readonly events?: Readonly<Record<string, EventManifestEntry>>;
}
