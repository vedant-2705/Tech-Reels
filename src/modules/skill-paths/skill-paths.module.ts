/**
 * @module modules/skill-paths/skill-paths.module
 * @description
 * Wires the Skill Paths module: controller, service, repository,
 * and the VideoTelemetrySubscriber.
 *
 * Queue injection notes:
 *   QueuesModule is @Global() and pre-registers all queues in the
 *   application. Do NOT call BullModule.registerQueue() here - that
 *   would create duplicate queue registrations and break BullMQ.
 *   The @InjectQueue() decorators in the service and subscriber resolve
 *   against the global registrations automatically.
 *
 * DatabaseService and RedisService are provided by DatabaseModule and
 * RedisModule respectively, both of which are @Global() and available
 * to all modules without re-importing.
 *
 * ConfigService is provided by the root ConfigModule (also global).
 */

import { Module } from "@nestjs/common";
import { SkillPathsController } from "./skill-paths.controller";
import { SkillPathsService } from "./skill-paths.service";
import { SkillPathsRepository } from "./skill-paths.repository";
import { VideoTelemetrySubscriber } from "./subscribers/video-telemetry.subscriber";

@Module({
    controllers: [SkillPathsController],
    providers: [
        SkillPathsService,
        SkillPathsRepository,
        VideoTelemetrySubscriber,
    ],
})
export class SkillPathsModule {}
