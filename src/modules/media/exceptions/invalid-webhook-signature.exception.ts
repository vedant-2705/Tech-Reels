/**
 * @module modules/media/exceptions/invalid-webhook-signature.exception
 * @description
 * Thrown by the webhook handler when the HMAC-SHA256 signature in the
 * X-Webhook-Signature header does not match the expected digest computed
 * from the raw request body and WEBHOOK_SECRET.
 */

import { HttpStatus } from "@nestjs/common";
import { AppException } from "@common/exceptions/app.exception";

/**
 * HTTP 401 - HMAC-SHA256 signature mismatch on POST /media/webhook.
 *
 * Signature comparison in the service layer uses `crypto.timingSafeEqual`
 * to prevent timing attacks before this exception is ever constructed.
 */
export class InvalidWebhookSignatureException extends AppException {
    constructor() {
        super({
            type: "https://techreel.io/errors/invalid-webhook-signature",
            title: "Invalid Webhook Signature",
            status: HttpStatus.UNAUTHORIZED,
            detail:
                "The X-Webhook-Signature header is missing or does not match " +
                "the expected HMAC-SHA256 digest of the request body.",
        });
    }
}
