/**
 * @module s3/s3.module
 * @description
 * Global module that provides S3Service to the entire application.
 * Import once in AppModule - all feature modules get S3Service automatically.
 */

import { Global, Module } from "@nestjs/common";
import { S3Service } from "./s3.service";

@Global()
@Module({
    providers: [S3Service],
    exports: [S3Service],
})
export class S3Module {}
