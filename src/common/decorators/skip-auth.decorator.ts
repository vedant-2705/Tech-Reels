import { SetMetadata } from "@nestjs/common";

/**
 * Mark a controller method as public — JwtAuthGuard will skip it.
 *
 * Usage:
 *   @SkipAuth()
 *   @Post('register')
 *   async register(@Body() dto: RegisterDto) { ... }
 */
export const IS_PUBLIC_KEY = "isPublic";
export const SkipAuth = () => SetMetadata(IS_PUBLIC_KEY, true);
