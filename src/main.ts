import { NestFactory, Reflector } from "@nestjs/core";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { globalValidationPipe } from "./common/pipes/validation.pipe";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule);

    //  Global API prefix 
    app.setGlobalPrefix("api/v1");

    //  Global validation pipe - class-validator on all DTOs 
    app.useGlobalPipes(globalValidationPipe);

    //  Global exception filter - RFC 7807 
    app.useGlobalFilters(new HttpExceptionFilter());

    //  Global logging interceptor 
    app.useGlobalInterceptors(new LoggingInterceptor());

    //  Global guards - JWT auth + roles 
    // JwtAuthGuard is applied globally; individual routes use @SkipAuth()
    // to opt out. RolesGuard checks @Roles('admin') on protected routes.
    const reflector = app.get(Reflector);
    app.useGlobalGuards(new JwtAuthGuard(reflector), new RolesGuard(reflector));

    //  Start 
    const port = process.env.PORT ?? 3000;
    await app.listen(port);
    console.log(`TechReel API running on http://localhost:${port}/api/v1`);
}

bootstrap();
