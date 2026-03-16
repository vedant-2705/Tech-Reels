/**
 * @module common/decorators/roles.decorator
 * @description
 * A custom method decorator to specify required user roles for route handlers.
 * Works in conjunction with RolesGuard to enforce role-based access control.
 */

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
