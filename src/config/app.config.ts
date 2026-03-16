/**
 * @module config/app.config
 * @description
 * Application-level configuration namespace for runtime environment,
 * HTTP port, and base API URL.
 */

import { registerAs } from '@nestjs/config';

/**
 * App configuration factory registered under the `app` namespace.
 */
export default registerAs('app', () => ({
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
    apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000',
}));
