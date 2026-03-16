/**
 * @module common/guards/jwt-auth.guard
 * @description
 * Global JWT guard that protects routes unless explicitly marked as public.
 */

import { ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { IS_PUBLIC_KEY } from "../decorators/skip-auth.decorator";

/**
 * Global JWT auth guard.
 * Applied at the controller class level by default.
 * Use @SkipAuth() on individual routes to bypass.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
    /**
     * @param reflector Metadata reflector used to resolve public-route markers.
     */
    constructor(private readonly reflector: Reflector) {
        super();
    }

    /**
     * Bypass authentication when route metadata marks the endpoint as public.
     *
     * @param context Current request execution context.
     * @returns Guard activation result from Passport when route is protected.
     */
    canActivate(context: ExecutionContext) {
        // Check if the handler or class is marked as public
        const isPublic = this.reflector.getAllAndOverride<boolean>(
            IS_PUBLIC_KEY,
            [context.getHandler(), context.getClass()],
        );

        if (isPublic) return true;

        return super.canActivate(context);
    }
}
