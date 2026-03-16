import { Global, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QUEUES } from "./queue-names";

/**
 * Registers every BullMQ queue so any module can inject a Queue instance
 * by name without re-registering it locally.
 *
 * All queues share the Redis connection configured in app.module.ts
 * via BullModule.forRootAsync.
 */
@Global()
@Module({
    imports: [
        BullModule.registerQueue({ name: QUEUES.VIDEO_PROCESSING }),
        BullModule.registerQueue({ name: QUEUES.XP_AWARD }),
        BullModule.registerQueue({ name: QUEUES.BADGE_EVALUATION }),
        BullModule.registerQueue({ name: QUEUES.NOTIFICATION }),
        BullModule.registerQueue({ name: QUEUES.REPORT_EVALUATION }),
        BullModule.registerQueue({ name: QUEUES.FEED_BUILD }),
    ],
    exports: [BullModule],
})
export class QueuesModule {}
