import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";

// Config
import appConfig from "./config/app.config";
import databaseConfig from "./config/database.config";
import redisConfig from "./config/redis.config";
import jwtConfig from "./config/jwt.config";
import s3Config from "./config/s3.config";

// Infrastructure - global modules
import { DatabaseModule } from "./database/database.module";
import { RedisModule } from "./redis/redis.module";
import { QueuesModule } from "./queues/queues.module";
import { S3Module } from "./s3/s3.module";

// Feature modules
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "@modules/users/users.module";
import { TagsModule } from "@modules/tags/tags.module";
import { ReelsModule } from "@modules/reels/reels.module";
import { MediaModule } from "@modules/media/media.module";
import { ChallengesModule } from "@modules/challenges/challenges.module";

@Module({
    imports: [
        //  Config - loaded once, available everywhere via ConfigService
        ConfigModule.forRoot({
            isGlobal: true,
            load: [appConfig, databaseConfig, redisConfig, jwtConfig, s3Config],
            // .env file is the source in development; in production use real env vars
            envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
            cache: true,
        }),

        //  BullMQ - configure Redis connection for all queues
        BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                connection: {
                    host: config.get<string>("REDIS_HOST"),
                    port: config.get<number>("REDIS_PORT"),
                    ...(config.get<string>("REDIS_PASSWORD")
                        ? { password: config.get<string>("REDIS_PASSWORD") }
                        : {}),
                    maxRetriesPerRequest: null, // required by BullMQ
                    enableReadyCheck: false, // required by BullMQ
                },
                defaultJobOptions: {
                    attempts: 3,
                    backoff: { type: "exponential", delay: 1000 },
                    removeOnComplete: { count: 1000 },
                    removeOnFail: { count: 5000 },
                },
            }),
        }),

        //  Global infrastructure
        DatabaseModule,
        RedisModule,
        QueuesModule,
        S3Module,

        //  Feature modules (add each as built)
        AuthModule,
        UsersModule,
        TagsModule,
        ReelsModule,
        MediaModule,
        ChallengesModule,
    ],
})
export class AppModule {}
