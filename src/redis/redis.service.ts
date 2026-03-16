import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
    public readonly client: Redis;

    constructor(private readonly config: ConfigService) {
        this.client = new Redis({
            host: this.config.get<string>("REDIS_HOST"),
            port: this.config.get<number>("REDIS_PORT"),
            // Only pass password if it's set - ioredis errors on empty-string password
            ...(this.config.get<string>("REDIS_PASSWORD")
                ? { password: this.config.get<string>("REDIS_PASSWORD") }
                : {}),
            // Reconnect strategy - exponential backoff capped at 10s
            retryStrategy: (times: number) => Math.min(times * 200, 10_000),
            maxRetriesPerRequest: null, // required by BullMQ
            enableReadyCheck: false, // required by BullMQ
            lazyConnect: false,
        });

        this.client.on("error", (err: Error) => {
            console.error("[RedisService] Connection error:", err.message);
        });
    }

    //  String operations

    async get(key: string): Promise<string | null> {
        return this.client.get(key);
    }

    async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
        if (ttlSeconds) {
            await this.client.setex(key, ttlSeconds, value);
        } else {
            await this.client.set(key, value);
        }
    }

    async del(...keys: string[]): Promise<void> {
        if (keys.length > 0) await this.client.del(...keys);
    }

    async exists(key: string): Promise<boolean> {
        return (await this.client.exists(key)) === 1;
    }

    async incr(key: string): Promise<number> {
        return this.client.incr(key);
    }

    async decr(key: string): Promise<number> {
        return this.client.decr(key);
    }

    async expire(key: string, ttlSeconds: number): Promise<void> {
        await this.client.expire(key, ttlSeconds);
    }

    async ttl(key: string): Promise<number> {
        return this.client.ttl(key);
    }

    //  Hash operations

    async hset(key: string, fields: Record<string, string>): Promise<void> {
        await this.client.hset(key, fields);
    }

    async hget(key: string, field: string): Promise<string | null> {
        return this.client.hget(key, field);
    }

    async hgetall(key: string): Promise<Record<string, string> | null> {
        const result = await this.client.hgetall(key);
        return Object.keys(result).length > 0 ? result : null;
    }

    //  List operations

    async lpop(key: string, count?: number): Promise<string[]> {
        const result = count
            ? await this.client.lpop(key, count)
            : await this.client.lpop(key);
        if (!result) return [];
        return Array.isArray(result) ? result : [result];
    }

    async rpush(key: string, ...values: string[]): Promise<void> {
        await this.client.rpush(key, ...values);
    }

    async llen(key: string): Promise<number> {
        return this.client.llen(key);
    }

    //  Sorted set operations

    async zadd(key: string, score: number, member: string): Promise<void> {
        await this.client.zadd(key, score, member);
    }

    async zincrby(
        key: string,
        increment: number,
        member: string,
    ): Promise<void> {
        await this.client.zincrby(key, increment, member);
    }

    async zrevrank(key: string, member: string): Promise<number | null> {
        return this.client.zrevrank(key, member);
    }

    //  Pub/Sub
    // Publish only - subscribers use a separate dedicated Redis connection
    // to avoid blocking the shared client.

    async publish(channel: string, message: string): Promise<void> {
        await this.client.publish(channel, message);
    }

    //  Pattern scan + delete
    // Used for session revocation: deletePattern('refresh:{userId}:*')

    async deletePattern(pattern: string): Promise<void> {
        const stream = this.client.scanStream({ match: pattern, count: 100 });
        const pipeline = this.client.pipeline();

        stream.on("data", (keys: string[]) => {
            keys.forEach((key) => pipeline.del(key));
        });

        await new Promise<void>((resolve, reject) => {
            stream.on("end", () => {
                pipeline
                    .exec()
                    .then(() => resolve())
                    .catch(reject);
            });
            stream.on("error", reject);
        });
    }

    // Lifecycle

    async onModuleDestroy(): Promise<void> {
        await this.client.quit();
    }
}
