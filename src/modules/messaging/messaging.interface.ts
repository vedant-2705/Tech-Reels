// ---------------------------------------------------------------------------
// AppMessage Envelope
//
// Every BullMQ job and every Redis Pub/Sub event is stored as AppMessage<T>.
//
// Workers access data via:  job.data.payload  (not job.data directly)
// Subscribers parse into:   AppMessage<EventPayload>
//
// BaseWorker and BaseSubscriber handle the unwrapping so individual
// handlers never touch the envelope fields.
// ---------------------------------------------------------------------------

export interface AppMessageMetadata {
    /** Propagated from AsyncLocalStorage / CLS - set at the HTTP boundary. */
    correlationId?: string;
    /** The userId driving the action, when applicable. */
    userId?: string;
}

export interface AppMessage<T = unknown> {
    /** UUIDv4 - unique per message, useful for deduplication / idempotency checks. */
    id: string;
    /**
     * The job name or event type string.
     * e.g. GAMIFICATION_QUEUE_JOBS.XP_AWARD or FEED_EVENTS.FEED_LOW
     * Workers and subscribers switch/route on this field.
     */
    type: string;
    /** ISO 8601 timestamp of when the message was dispatched. */
    timestamp: string;
    /** The actual typed payload. Workers receive this after BaseWorker unwraps it. */
    payload: T;
    metadata?: AppMessageMetadata;
}