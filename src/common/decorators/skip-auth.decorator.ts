/**
 * @module common/decorators/skip-auth.decorator
 * @description
 * Mark a controller method as public - JwtAuthGuard will skip it.
 */

import { SetMetadata } from "@nestjs/common";

/**
 * Usage:
 *   @SkipAuth()
 *   @Post('register')
 *   async register(@Body() dto: RegisterDto) { ... }
 */
export const IS_PUBLIC_KEY = "isPublic";
export const SkipAuth = () => SetMetadata(IS_PUBLIC_KEY, true);
