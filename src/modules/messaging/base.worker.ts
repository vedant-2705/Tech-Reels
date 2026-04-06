import { Logger } from "@nestjs/common";
import { WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { AppMessage } from "./messaging.interface";

/**
 * BaseWorker
 *
 * Extends NestJS WorkerHost to add one thing: envelope unwrapping.
 *
 * All jobs dispatched via MessagingService arrive as AppMessage<T> in job.data.
 * BaseWorker's process() intercepts the raw job, extracts job.data.payload,
 * and forwards it to handle() - so every concrete worker only sees the
 * typed business payload, never the envelope fields (id, type, timestamp).
 *
 * Concrete workers:
 *   1. Extend BaseWorker<YourPayloadType>
 *   2. Implement handle(payload: YourPayloadType, job: Job) with their switch
 *   3. Never call super.process() or touch job.data.payload directly
 *
 * @example
 * @Processor(QUEUES.XP_AWARD)
 * export class XpAwardWorker extends BaseWorker<XpAwardJobPayload> {
 *   async handle(payload: XpAwardJobPayload, job: Job): Promise<void> {
 *     switch (job.name) {
 *       case GAMIFICATION_QUEUE_JOBS.XP_AWARD:
 *         await this.gamificationService.awardXp(payload);
 *         break;
 *       default:
 *         this.logger.warn(`Unknown job: ${job.name}`);
 *     }
 *   }
 * }
 */
export abstract class BaseWorker<T = unknown> extends WorkerHost {
    protected readonly logger = new Logger(this.constructor.name);

    /**
     * Called by BullMQ for every job on this queue.
     * Unwraps the AppMessage envelope and delegates to handle().
     *
     * If job.data has no .payload field the worker was probably registered
     * on a queue that pre-dates MessagingService - we fall back to passing
     * job.data as-is so legacy jobs are not silently dropped during migration.
     */
    async process(job: Job<AppMessage<T> | T>): Promise<void> {
        const isEnveloped =
            job.data !== null &&
            typeof job.data === "object" &&
            "payload" in job.data &&
            "id" in job.data &&
            "type" in job.data;

        const payload: T = isEnveloped
            ? (job.data as AppMessage<T>).payload
            : (job.data as T);

        if (isEnveloped) {
            const envelope = job.data as AppMessage<T>;
            this.logger.debug(
                `Processing job | name="${job.name}" envelope_id="${envelope.id}" ` +
                    `dispatched_at="${envelope.timestamp}"`,
            );
        }

        await this.handle(payload, job);
    }

    /**
     * Implement this in each concrete worker.
     * Receives the unwrapped, typed payload - no envelope fields.
     *
     * @param payload - The typed business payload from AppMessage.payload
     * @param job     - Full BullMQ Job (for job.name, job.id, job.opts, etc.)
     */
    abstract handle(payload: T, job: Job): Promise<void>;
}
