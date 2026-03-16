/**
 * @module common/exceptions/oauth-failed.exception
 * @description
 * Authentication exception for OAuth code exchange or profile retrieval failures.
 */

import { AppException } from "./app.exception";
import { HttpStatus } from "@nestjs/common";

/**
 * Thrown when an OAuth authentication attempt fails due to issues like invalid authorization code, token exchange failure, or profile retrieval errors from the provider.
 */
export class OAuthFailedException extends AppException {
    /**
     * @param provider The OAuth provider that was being used.
     */
    constructor(provider: string) {
        super({
            type: "https://techreel.io/errors/oauth-failed",
            title: "OAuth Authentication Failed",
            status: HttpStatus.UNAUTHORIZED,
            detail: `Could not authenticate with ${provider}. Please try again.`,
        });
    }
}
