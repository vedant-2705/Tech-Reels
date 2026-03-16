/**
 * @module common/filters/http-exception.filter
 * @description
 * Global HTTP exception filter that normalizes all thrown errors into a
 * consistent API error response contract.
 */

import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
} from "@nestjs/common";
import { Request, Response } from "express";
import { AppException } from "../exceptions/app.exception";

/**
 * Converts application, framework, and unhandled errors into structured JSON.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    /**
     * Handle and serialize exceptions raised during request processing.
     *
     * @param exception Unknown thrown value from the request pipeline.
     * @param host Execution context host for HTTP request/response objects.
     */
    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        //  Our custom structured errors 
        if (exception instanceof AppException) {
            const opts = exception.getOpts();
            response.status(opts.status).json({
                type: opts.type,
                title: opts.title,
                status: opts.status,
                detail: opts.detail,
                instance: request.url,
                timestamp: new Date().toISOString(),
                ...(opts.errors ? { errors: opts.errors } : {}),
            });
            return;
        }

        //  NestJS HttpException (includes class-validator 400s) 
        if (exception instanceof HttpException) {
            const status = exception.getStatus();
            const body = exception.getResponse() as Record<string, unknown>;

            // class-validator produces { message: string[], error: string }
            if (Array.isArray(body?.message)) {
                response.status(HttpStatus.BAD_REQUEST).json({
                    type: "https://techreel.io/errors/validation",
                    title: "Validation Failed",
                    status: HttpStatus.BAD_REQUEST,
                    detail: "One or more fields failed validation",
                    instance: request.url,
                    timestamp: new Date().toISOString(),
                    errors: (body.message as string[]).map((msg: string) => {
                        // class-validator format: "fieldName must be..."
                        const spaceIdx = msg.indexOf(" ");
                        return {
                            field:
                                spaceIdx !== -1 ? msg.slice(0, spaceIdx) : msg,
                            message:
                                spaceIdx !== -1 ? msg.slice(spaceIdx + 1) : msg,
                        };
                    }),
                });
                return;
            }

            response.status(status).json({
                type: "https://techreel.io/errors/http-error",
                title:
                    typeof body?.error === "string"
                        ? body.error
                        : (HttpStatus[status] ?? "Error"),
                status,
                detail:
                    typeof body?.message === "string"
                        ? body.message
                        : "An error occurred",
                instance: request.url,
                timestamp: new Date().toISOString(),
            });
            return;
        }

        //  Unhandled - 500 
        console.error("[UnhandledException]", exception);
        response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            type: "https://techreel.io/errors/internal-server-error",
            title: "Internal Server Error",
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            detail: "An unexpected error occurred",
            instance: request.url,
            timestamp: new Date().toISOString(),
        });
    }
}
