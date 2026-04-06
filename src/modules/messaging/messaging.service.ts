import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { getQueueToken } from "@nestjs/bullmq";
import { Queue, JobsOptions } from "bullmq";
import { randomUUID } from "crypto";

import { RedisService } from "@redis/redis.service";
import { AppMessage, AppMessageMetadata } from "./messaging.interface";
import { DEFAULT_JOB_OPTIONS } from "./messaging.constants";
import {
    EVENT_CHANNEL_REGISTRY,
    JOB_QUEUE_REGISTRY,
} from "./messaging.registry";

@Injectable()
export class MessagingService implements OnModuleInit {
    private readonly logger = new Logger(MessagingService.name);

    /**
     * Runtime map of queueName -> Queue instance.
     * Populated once on module init via ModuleRef - zero @InjectQueue decorators
     * needed here. Adding a new queue = register in QueuesModule + one registry line.
     */
    private readonly queueMap = new Map<string, Queue>();

    constructor(
        private readonly moduleRef: ModuleRef,
        private readonly redisService: RedisService,
    ) {}

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    async onModuleInit(): Promise<void> {
        await this.initQueueMap();
    }

    /**
     * Resolves every Queue instance referenced by the registry at startup.
     * Fails fast - a missing queue registration is a deployment bug that
     * must surface immediately, not silently drop jobs at runtime.
     */
    private async initQueueMap(): Promise<void> {
        // Deduplicate: multiple job names can target the same physical queue
        const uniqueQueueNames = new Set(Object.values(JOB_QUEUE_REGISTRY));

        for (const queueName of uniqueQueueNames) {
            try {
                const queue = this.moduleRef.get<Queue>(
                    getQueueToken(queueName),
                    { strict: false },
                );
                this.queueMap.set(queueName, queue);
                this.logger.log(`Queue resolved: "${queueName}"`);
            } catch {
                throw new Error(
                    `MessagingService: Failed to resolve queue "${queueName}". ` +
                        `Ensure BullModule.registerQueue({ name: '${queueName}' }) ` +
                        `exists in QueuesModule.`,
                );
            }
        }

        this.logger.log(
            `MessagingService ready - ${this.queueMap.size} queue(s) initialised.`,
        );
    }

    // -------------------------------------------------------------------------
    // Public API - Job Dispatch
    // -------------------------------------------------------------------------

    /**
     * Enqueues a job to the correct BullMQ queue.
     *
     * The caller passes only the job name and payload.
     * Queue selection, envelope construction, and retry config are internal.
     *
     * Workers receive the full AppMessage envelope as job.data.
     * Use BaseWorker to unwrap job.data.payload automatically.
     *
     * @param jobName  - A value from any *_QUEUE_JOBS constant
     * @param payload  - Typed job payload (becomes AppMessage.payload in the queue)
     * @param options  - Optional per-call BullMQ overrides, merged over DEFAULT_JOB_OPTIONS
     * @param metadata - Optional correlationId / userId for distributed tracing
     *
     * @example
     * // Caller knows nothing about queues
     * await this.messagingService.dispatchJob(
     *   GAMIFICATION_QUEUE_JOBS.XP_AWARD,
     *   { userId, source: XP_SOURCE.REEL_WATCH, xp_amount: 10, reference_id: reelId },
     * );
     */
    async dispatchJob<T>(
        jobName: string,
        payload: T,
        options?: JobsOptions,
        metadata?: AppMessageMetadata,
    ): Promise<void> {
        const queue = this.resolveQueue(jobName);
        const message = this.buildEnvelope(jobName, payload, metadata);
        const finalOptions: JobsOptions = {
            ...DEFAULT_JOB_OPTIONS,
            ...options,
        };

        await queue.add(jobName, message, finalOptions);

        this.logger.debug(
            `Job dispatched | job="${jobName}" queue="${queue.name}" id="${message.id}"`,
        );
    }

    // -------------------------------------------------------------------------
    // Public API - Event Dispatch
    // -------------------------------------------------------------------------

    /**
     * Publishes a structured event to the correct Redis Pub/Sub channel.
     *
     * The caller passes only the event type and payload.
     * Channel selection and envelope construction are internal.
     *
     * Subscribers receive the full JSON-serialised AppMessage envelope.
     * Use BaseSubscriber to parse and unwrap automatically.
     *
     * @param eventType - A value from any *_EVENTS constant
     * @param payload   - Typed event payload (becomes AppMessage.payload)
     * @param metadata  - Optional correlationId / userId for distributed tracing
     *
     * @example
     * await this.messagingService.dispatchEvent(
     *   FEED_EVENTS.FEED_LOW,
     *   { userId, remaining },
     * );
     */
    async dispatchEvent<T>(
        eventType: string,
        payload: T,
        metadata?: AppMessageMetadata,
    ): Promise<void> {
        const channel = this.resolveChannel(eventType);
        const message = this.buildEnvelope(eventType, payload, metadata);

        await this.redisService.publish(channel, JSON.stringify(message));

        this.logger.debug(
            `Event dispatched | event="${eventType}" channel="${channel}" id="${message.id}"`,
        );
    }

    // -------------------------------------------------------------------------
    // Private - Routing
    // -------------------------------------------------------------------------

    /**
     * Resolves the physical Queue instance for a job name.
     * Two-step lookup: registry gives the queue name, queueMap gives the instance.
     * Throws explicitly at both steps - no silent failures, no default fallbacks.
     */
    private resolveQueue(jobName: string): Queue {
        const queueName = JOB_QUEUE_REGISTRY[jobName];
        if (!queueName) {
            throw new Error(
                `MessagingService: No queue registered for job "${jobName}". ` +
                    `Add an entry to JOB_QUEUE_REGISTRY in messaging.registry.ts.`,
            );
        }

        const queue = this.queueMap.get(queueName);
        if (!queue) {
            // Should never reach here if onModuleInit passed - defence in depth.
            throw new Error(
                `MessagingService: Queue "${queueName}" is in the registry ` +
                    `but was not resolved at startup. Check QueuesModule registration.`,
            );
        }

        return queue;
    }

    /**
     * Resolves the physical Redis channel for an event type.
     * Throws explicitly on unknown event types - no default channel fallback.
     */
    private resolveChannel(eventType: string): string {
        const channel = EVENT_CHANNEL_REGISTRY[eventType];
        if (!channel) {
            throw new Error(
                `MessagingService: No channel registered for event "${eventType}". ` +
                    `Add an entry to EVENT_CHANNEL_REGISTRY in messaging.registry.ts.`,
            );
        }
        return channel;
    }

    // -------------------------------------------------------------------------
    // Private - Envelope Construction
    // -------------------------------------------------------------------------

    /**
     * Wraps any payload in the standard AppMessage envelope.
     * Every job and event gets a unique id, type, timestamp, and optional
     * tracing metadata - making log correlation and APM tracing trivial.
     */
    private buildEnvelope<T>(
        type: string,
        payload: T,
        metadata?: AppMessageMetadata,
    ): AppMessage<T> {
        return {
            id: randomUUID(),
            type,
            timestamp: new Date().toISOString(),
            payload,
            ...(metadata && { metadata }),
        };
    }
}
