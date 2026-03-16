import { HttpException } from "@nestjs/common";

export interface AppExceptionOptions {
    type: string;
    title: string;
    status: number;
    detail: string;
    errors?: { field: string; message: string }[];
}

export class AppException extends HttpException {
    constructor(private readonly opts: AppExceptionOptions) {
        super(opts, opts.status);
    }

    getOpts(): AppExceptionOptions {
        return this.opts;
    }
}
