import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/**
 * Extracts the current authenticated user (or a single field) from the request.
 * Populated by JwtStrategy.validate() after a successful token verification.
 *
 * Usage — full user object:
 *   async getMe(@CurrentUser() user: JwtUser) { ... }
 *
 * Usage — single field (most common):
 *   async logout(@CurrentUser('userId') userId: string) { ... }
 *   async getMe(@CurrentUser('role') role: string) { ... }
 */
export const CurrentUser = createParamDecorator(
    (field: string | undefined, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest<{
            user: Record<string, unknown>;
        }>();
        const user = request.user;
        return field !== undefined ? user?.[field] : user;
    },
);
