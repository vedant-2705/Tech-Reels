/**
 * @module common/guards/roles.guard
 * @description
 * Authorization guard that enforces route role metadata set by the roles
 * decorator and rejects users with insufficient permissions.
 */

import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ForbiddenException } from "../exceptions/forbidden.exception";

/**
 * Validates user role against required handler metadata.
 */
@Injectable()
export class RolesGuard implements CanActivate {
    /**
     * @param reflector Metadata reflector used to read required route role.
     */
    constructor(private readonly reflector: Reflector) {}

    /**
     * Authorize request when user role matches required handler role.
     *
     * @param context Current request execution context.
     * @returns true when role requirements are satisfied.
     */
    canActivate(context: ExecutionContext): boolean {
        const requiredRole = this.reflector.get<string>(
            "role",
            context.getHandler(),
        );

        // No @Roles() on this handler - allow through
        if (!requiredRole) return true;

        const { user } = context.switchToHttp().getRequest<{
            user: { role: string };
        }>();

        if (user?.role !== requiredRole) throw new ForbiddenException();

        return true;
    }
}
