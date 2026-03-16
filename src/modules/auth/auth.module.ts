import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";

import { AUTH_JWT, AUTH_TTL } from "./auth.constants";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthRepository } from "./auth.repository";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { OAuthService } from "./strategies/oauth.strategy";

/**
 * AuthModule
 *
 * JwtModule is registered with useFactory so it reads the RSA keys from
 * ConfigService at runtime. The module-level config (privateKey / algorithms)
 * covers the default sign options; per-call overrides in AuthService handle
 * the RS256 vs HS256 split.
 *
 * PassportModule registers the 'jwt' strategy name used by JwtAuthGuard.
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
                        config.get<number>(AUTH_JWT.ACCESS_TTL_ENV) ??
                        AUTH_TTL.ACCESS_TOKEN_SECONDS,
                },
            }),
        }),
    ],
    controllers: [AuthController],
    providers: [AuthService, AuthRepository, JwtStrategy, OAuthService],
    exports: [
        // Exported so other modules can verify JWTs or use JwtService if needed
        JwtModule,
        PassportModule,
    ],
})
export class AuthModule {}
