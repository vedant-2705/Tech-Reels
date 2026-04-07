// Module & Service
export { MessagingModule } from "./messaging.module";
export { MessagingService } from "./messaging.service";

// Base classes for workers and subscribers
export { BaseWorker } from "./base.worker";
export { BaseSubscriber } from "./base.subscriber";

// Envelope types
export type { AppMessage, AppMessageMetadata } from "./messaging.interface";

// Constants - channel names (only subscribers need these)
export { REDIS_CHANNELS } from "./messaging.constants";

// Constants - job options
export { DEFAULT_JOB_OPTIONS } from "./messaging.constants";
