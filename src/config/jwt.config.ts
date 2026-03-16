/**
 * @module config/jwt.config
 * @description
 * JWT configuration namespace for signing keys, token lifetimes,
 * and refresh-token secret settings.
 */

import { registerAs } from "@nestjs/config";

/**
 * JWT configuration factory registered under the `jwt` namespace.
 */
export default registerAs("jwt", () => ({
    // PEM keys are stored in .env with literal \n - restore real newlines here
    privateKey: (process.env.JWT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    publicKey: (process.env.JWT_PUBLIC_KEY ?? "").replace(/\\n/g, "\n"),
    accessTtl: parseInt(process.env.JWT_ACCESS_TTL ?? "900", 10),
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? "",
    refreshTtl: parseInt(process.env.JWT_REFRESH_TTL ?? "2592000", 10),
}));
