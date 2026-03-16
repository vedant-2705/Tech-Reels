/**
 * @module common/exceptions/app.exception
 * @description
 * Base structured HTTP exception used across the application.
 * Defines a consistent error payload contract for API responses.
 */

import { HttpException } from "@nestjs/common";

export interface AppExceptionOptions {
    type: string;
    title: string;
    status: number;
    detail: string;
    errors?: { field: string; message: string }[];
}

/**
 * Base application exception that all other exceptions extend.
 */
export class AppException extends HttpException {
    /**
     * @param opts {@link AppExceptionOptions} The options for the exception.
     */
    constructor(private readonly opts: AppExceptionOptions) {
        super(opts, opts.status);
    }

    /**
     * @returns The options used for the exception.
     */
    getOpts(): AppExceptionOptions {
        return this.opts;
    }
}
