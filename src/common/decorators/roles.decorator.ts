import { SetMetadata } from "@nestjs/common";

/**
 * Restrict a route to users with a specific role.
 * Requires RolesGuard to be active on the controller.
 *
 * Usage:
 *   @Roles('admin')
 *   @Post('tags')
 *   async createTag(@Body() dto: CreateTagDto) { ... }
 */
export const Roles = (role: string) => SetMetadata("role", role);
