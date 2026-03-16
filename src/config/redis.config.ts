/**
 * @module config/redis.config
 * @description
 * Redis configuration namespace for host, port, and optional password.
 */

import { registerAs } from '@nestjs/config';

/**
 * Redis configuration factory registered under the `redis` namespace.
 */
export default registerAs('redis', () => ({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  password: process.env.REDIS_PASSWORD ?? undefined,
}));
