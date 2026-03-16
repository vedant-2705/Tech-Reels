import { ValidationPipe } from "@nestjs/common";

/**
 * Global validation pipe configuration.
 *
 * Rules:
 * - whitelist: strips properties not declared in the DTO
 * - forbidNonWhitelisted: throws 400 if unknown properties are sent
 * - transform: auto-converts plain objects to DTO class instances
 * - enableImplicitConversion: handles @Type(() => Number) automatically
 *
 * Registered in main.ts via app.useGlobalPipes().
 */
export const globalValidationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
        enableImplicitConversion: true,
    },
});
