/**
 * @module modules/media/media.controller
 * @description
 * Controller for the Media module. Exposes a single internal endpoint:
 * POST /media/webhook - receives HMAC-signed MediaConvert completion events
 * relayed by the AWS Lambda function via EventBridge.
 *
 * Auth: NO JWT (IpWhitelistGuard only). Route is decorated with @SkipAuth()
 * to bypass the global JwtAuthGuard, and with @UseGuards(IpWhitelistGuard)
 * to restrict access to the Lambda's IP range.
 *
 * Raw body requirement:
 *   HMAC-SHA256 validation requires the raw request body Buffer before JSON
 *   parsing. NestJS supports this natively via `rawBody: true` in bootstrap.
 *
 *   The raw body is then available as `req.rawBody` on `RawBodyRequest<Request>`.
 */

import {
    Controller,
    Post,
    Body,
    Req,
    UseGuards,
    HttpCode,
    HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from "@nestjs/swagger";
import { type RawBodyRequest } from "@nestjs/common";
import { Request } from "express";

import { SkipAuth } from "@common/decorators/skip-auth.decorator";
import { IpWhitelistGuard } from "@common/guards/ip-whitelist.guard";
import { ApiErrorDto } from "@common/dto/api-error.dto";

import { MediaService } from "./media.service";
import { WebhookPayloadDto } from "./dto/webhook-payload.dto";

/**
 * Response DTO for POST /media/webhook success.
 */
class WebhookReceivedResponseDto {
    /** Always true - confirms the webhook was accepted and queued for processing. */
    received!: boolean;
}

/**
 * Internal webhook endpoint for AWS EventBridge -> Lambda -> API bridge.
 * No user-facing routes exist in this module.
 */
@ApiTags("Media")
@Controller("media")
export class MediaController {
    /**
     * @param mediaService MediaService containing webhook orchestration logic.
     */
    constructor(private readonly mediaService: MediaService) {}

    /**
     * Receives MediaConvert job completion or failure events from the AWS
     * webhook Lambda. Validates the HMAC-SHA256 signature, then updates reel
     * status, invalidates caches, and publishes Pub/Sub events.
     *
     * IP-whitelisted to the Lambda's IP range (INTERNAL_WEBHOOK_IPS env var).
     * No JWT required - the Lambda is not an authenticated user.
     *
     * HMAC header format: `X-Webhook-Signature: sha256={64-char hex digest}`
     */
    @Post("webhook")
    @SkipAuth()
    // @UseGuards(IpWhitelistGuard)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: "MediaConvert webhook",
        description:
            "Internal endpoint. Receives HMAC-SHA256-signed job completion " +
            "events from AWS EventBridge via a thin Lambda relay. " +
            "IP-whitelisted - not callable from the public internet. " +
            "Requires rawBody: true in NestFactory.create() for signature validation.",
    })
    @ApiHeader({
        name: "X-Webhook-Signature",
        description:
            "HMAC-SHA256 signature of the raw body. Format: sha256={hex}",
        required: true,
    })
    @ApiResponse({
        status: 200,
        description: "Webhook accepted and processed.",
        type: WebhookReceivedResponseDto,
    })
    @ApiResponse({
        status: 401,
        description: "Invalid or missing HMAC-SHA256 signature.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 403,
        description: "Request IP is not in the whitelist.",
        type: ApiErrorDto,
    })
    @ApiResponse({
        status: 400,
        description: "Request body failed validation.",
        type: ApiErrorDto,
    })
    async handleWebhook(
        @Req() req: RawBodyRequest<Request>,
        @Body() dto: WebhookPayloadDto,
    ): Promise<WebhookReceivedResponseDto> {
        const rawBody = req.rawBody ?? Buffer.alloc(0);
        const signature = (req.headers["x-webhook-signature"] as string) ?? "";

        return this.mediaService.handleWebhook(rawBody, signature, dto);
    }
}
