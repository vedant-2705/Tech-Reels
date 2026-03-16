import { AppException } from "./app.exception";
import { HttpStatus } from "@nestjs/common";

export class OAuthFailedException extends AppException {
    constructor(provider: string) {
        super({
            type: "https://techreel.io/errors/oauth-failed",
            title: "OAuth Authentication Failed",
            status: HttpStatus.UNAUTHORIZED,
            detail: `Could not authenticate with ${provider}. Please try again.`,
        });
    }
}
