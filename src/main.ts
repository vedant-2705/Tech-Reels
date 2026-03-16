import { NestFactory, Reflector } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
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

    // Swagger - development only
    if (process.env.NODE_ENV !== "production") {
        const config = new DocumentBuilder()
            .setTitle("TechReel API")
            .setDescription(
                "TechReel backend API - short-form video learning platform for software engineers.\n\n" +
                    "## Authentication\n" +
                    "Most endpoints require a Bearer token. Use **POST /auth/login** or **POST /auth/register** " +
                    "to get one, then click the **Authorize** button above and paste it in.\n\n" +
                    "## Error format\n" +
                    "All errors follow [RFC 7807](https://datatracker.ietf.org/doc/html/rfc7807) - " +
                    "`type`, `title`, `status`, `detail`, `instance`, `timestamp`.",
            )
            .setVersion("1.0")
            .setContact("TechReel", "https://techreel.io", "api@techreel.io")
            .addBearerAuth(
                {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                    description:
                        "Paste your access_token here. Get one from POST /auth/login.",
                },
                "access-token", // this key is referenced in @ApiBearerAuth('access-token')
            )
            .addTag(
                "Auth",
                "Registration, login, OAuth, JWT, session management",
            )
            .addTag("Users", "Profiles, stats, badges, XP history")
            .addTag("Tags", "Tag catalogue, admin management")
            .addTag("Media", "Presigned upload URLs, video processing pipeline")
            .addTag("Reels", "Reel CRUD, watch, like, save, share, report")
            .addTag(
                "Challenges",
                "Fetch challenges, submit attempts, evaluator",
            )
            .addTag("Feed", "Personalised feed delivery")
            .addTag("Gamification", "XP, streaks, badges, leaderboard")
            .addTag("Notifications", "SSE stream, push, notification inbox")
            .addTag(
                "Skill Paths",
                "Path catalogue, enrolment, progress, completion",
            )
            .addTag("Admin", "Content moderation, user management, analytics")
            .build();

        const document = SwaggerModule.createDocument(app, config);

        SwaggerModule.setup("api/v1/docs", app, document, {
            swaggerOptions: {
                persistAuthorization: true, // keeps token across page refreshes
                displayRequestDuration: true, // shows response time on each request
                filter: true, // enables search bar
                defaultModelsExpandDepth: 2, // expands schema models by default
                defaultModelExpandDepth: 2,
                docExpansion: "list", // show all endpoints collapsed by tag
                tagsSorter: "alpha",
                operationsSorter: "alpha",
            },
            customSiteTitle: "TechReel API Docs",
        });

        console.log(
            `Swagger docs at http://localhost:${process.env.PORT ?? 3000}/api/v1/docs`,
        );
    }

    //  Start
    const port = process.env.PORT ?? 3000;
    await app.listen(port);
    console.log(`TechReel API running on http://localhost:${port}/api/v1`);
}

bootstrap();
