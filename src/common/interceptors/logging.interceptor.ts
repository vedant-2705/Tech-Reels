/**
 * @module common/interceptors/logging.interceptor
 * @description
 * HTTP logging interceptor that records request method, path, status, and
 * execution duration for successful and failed responses.
 */

import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from "@nestjs/common";
import { Request, Response } from "express";
import { Observable, tap } from "rxjs";

/**
 * Logs every incoming HTTP request and its outcome.
 *
 * Output format:
 *   --> POST /api/v1/auth/login
 *   <-- POST /api/v1/auth/login 200 [42ms]
 *
 * Applied globally in main.ts via app.useGlobalInterceptors().
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
    /**
     * Log inbound request details and outbound outcome timing.
     *
     * @param context Current request execution context.
     * @param next Call handler representing the downstream pipeline.
     * @returns Observable wrapping the handler response stream.
     */
    intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Observable<unknown> {
        const request = context.switchToHttp().getRequest<Request>();
        const response = context.switchToHttp().getResponse<Response>();
        const { method, url } = request;
        const start = Date.now();

        console.log(`--> ${method} ${url}`);

        return next.handle().pipe(
            tap({
                next: () => {
                    const ms = Date.now() - start;
                    console.log(
                        `<-- ${method} ${url} ${response.statusCode} [${ms}ms]`,
                    );
                },
                error: (err: unknown) => {
                    const ms = Date.now() - start;
                    const status =
                        typeof err === "object" &&
                        err !== null &&
                        "status" in err &&
                        typeof (err as { status: unknown }).status === "number"
                            ? (err as { status: number }).status
                            : 500;
                    console.log(`<-- ${method} ${url} ${status} [${ms}ms]`);
                },
            }),
        );
    }
}
