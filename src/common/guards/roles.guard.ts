import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ForbiddenException } from "../exceptions/forbidden.exception";

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const requiredRole = this.reflector.get<string>(
            "role",
            context.getHandler(),
        );

        // No @Roles() on this handler — allow through
        if (!requiredRole) return true;

        const { user } = context.switchToHttp().getRequest<{
            user: { role: string };
        }>();

        if (user?.role !== requiredRole) throw new ForbiddenException();

        return true;
    }
}
