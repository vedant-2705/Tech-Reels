/**
 * @module modules/auth/auth.module
 * @description
 * Nest module that wires together authentication controllers, services,
 * repositories, and JWT strategy configuration.
 */

import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";

import { AUTH_JWT, AUTH_TTL } from "./auth.constants";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service.abstract";
import { AuthServiceImpl } from "./auth.service";
import { AuthRepository } from "./auth.repository";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { OAuthService } from "./strategies/oauth.strategy";
import { AuthSessionService } from "./auth-session.service";
import { TokenService } from "./services/token.service";
import { UsernameGeneratorService } from "./services/username-generator.service";

/**
 * Registers auth runtime dependencies and JWT signing/verification support.
 */
@Module({
    imports: [
        PassportModule.register({ defaultStrategy: "jwt" }),

        JwtModule.registerAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                // Default signing options - used when no per-call override is provided.
                // AuthService overrides algorithm and key per call for RS256 vs HS256.
                privateKey: config.get<string>(AUTH_JWT.PRIVATE_KEY_ENV),
                publicKey: config.get<string>(AUTH_JWT.PUBLIC_KEY_ENV),
                signOptions: {
                    algorithm: AUTH_JWT.ALGORITHM,
                    expiresIn:
                        parseInt(config.get<string>(AUTH_JWT.ACCESS_TTL_ENV) ??
                        AUTH_TTL.ACCESS_TOKEN_SECONDS, 10)
                },
            }),
        }),
    ],
    controllers: [AuthController],
    providers: [
        { provide: AuthService, useClass: AuthServiceImpl },
        AuthSessionService,
        AuthRepository,
        TokenService,
        UsernameGeneratorService,
        JwtStrategy,
        OAuthService,
    ],
    exports: [
        // Exported so other modules can verify JWTs or use JwtService if needed
        JwtModule,
        PassportModule,

        // For cross module session lifecycle ops (revocation, token version management)
        // eg. Users module needs to revoke sessions on password change or account deactivation.
        AuthSessionService,
    ],
})
export class AuthModule {}
