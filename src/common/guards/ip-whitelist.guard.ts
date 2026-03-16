import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { ForbiddenException } from "../exceptions/forbidden.exception";

/**
 * Restricts access to routes based on caller IP address.
 * Used on internal/webhook endpoints — not user-facing routes.
 *
 * Allowed IPs are read from INTERNAL_WEBHOOK_IPS env var (comma-separated).
 * Example: INTERNAL_WEBHOOK_IPS=127.0.0.1,10.0.0.1
 *
 * Usage:
 *   @UseGuards(IpWhitelistGuard)
 *   @Post('internal/webhook')
 */
@Injectable()
export class IpWhitelistGuard implements CanActivate {
    private readonly allowedIps: string[];

    constructor(private readonly config: ConfigService) {
        const raw = this.config.get<string>("INTERNAL_WEBHOOK_IPS") ?? "";
        this.allowedIps = raw
            .split(",")
            .map((ip) => ip.trim())
            .filter(Boolean);
    }

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>();

        // Respect X-Forwarded-For when behind a reverse proxy
        const forwarded = request.headers["x-forwarded-for"];
        const callerIp =
            (Array.isArray(forwarded)
                ? forwarded[0]
                : forwarded?.split(",")[0]
            )?.trim() ??
            request.socket.remoteAddress ??
            "";

        if (!this.allowedIps.includes(callerIp)) {
            throw new ForbiddenException(
                "Access denied: your IP is not authorised to call this endpoint",
            );
        }

        return true;
    }
}
