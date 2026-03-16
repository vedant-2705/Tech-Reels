/**
 * @module modules/auth/strategies/oauth.strategy
 * @description
 * OAuth integration service responsible for exchanging provider authorization
 * codes and normalizing provider profile data.
 */

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { OAuthFailedException } from "@common/exceptions/oauth-failed.exception";
import { AUTH_OAUTH, OAuthProvider } from "../auth.constants";

/**
 * Normalized OAuth profile returned from provider integrations.
 */
export interface OAuthProfile {
    provider_user_id: string;
    email: string;
    name: string;
    avatar_url: string | null;
}

/**
 * Handles server-side OAuth authorization code exchange.
 *
 * Flow:
 *   1. Client receives the authorization code from the provider redirect.
 *   2. Client POSTs the code to POST /auth/oauth/:provider.
 *   3. This service exchanges the code for an access token with the provider.
 *   4. Uses the access token to fetch the user's profile.
 *   5. Provider access token is discarded immediately - never stored.
 *
 * Returns a normalized OAuthProfile regardless of provider.
 */
@Injectable()
export class OAuthService {
    /**
     * @param config Runtime configuration provider.
     */
    constructor(private readonly config: ConfigService) {}

    /**
     * Exchange an authorization code for a normalized provider profile.
     *
     * @param provider Selected OAuth provider.
     * @param code Provider authorization code.
     * @returns Normalized OAuth profile.
     */
    async exchangeCode(
        provider: OAuthProvider,
        code: string,
    ): Promise<OAuthProfile> {
        if (provider === AUTH_OAUTH.PROVIDERS.GOOGLE) {
            return this.exchangeGoogle(code);
        }
        return this.exchangeGithub(code);
    }

    /**
     * Perform Google OAuth code exchange and profile lookup.
     *
     * @param code Google authorization code.
     * @returns Normalized Google profile.
     */

    private async exchangeGoogle(code: string): Promise<OAuthProfile> {
        // Step 1 - exchange code for access token
        let accessToken: string;
        try {
            const tokenRes = await axios.post<{
                access_token: string;
                error?: string;
            }>(
                AUTH_OAUTH.URLS.GOOGLE_TOKEN,
                {
                    code,
                    client_id: this.config.get<string>(
                        AUTH_OAUTH.ENV_KEYS.GOOGLE_CLIENT_ID,
                    ),
                    client_secret: this.config.get<string>(
                        AUTH_OAUTH.ENV_KEYS.GOOGLE_CLIENT_SECRET,
                    ),
                    redirect_uri: AUTH_OAUTH.REDIRECT_URI_POSTMESSAGE, // used for mobile/SPA flows
                    grant_type: AUTH_OAUTH.GRANT_TYPE_AUTHORIZATION_CODE,
                },
                {
                    headers: {
                        "Content-Type": AUTH_OAUTH.HEADERS.JSON_CONTENT_TYPE,
                    },
                },
            );

            if (tokenRes.data.error || !tokenRes.data.access_token) {
                throw new OAuthFailedException(AUTH_OAUTH.PROVIDERS.GOOGLE);
            }

            accessToken = tokenRes.data.access_token;
        } catch (err) {
            if (err instanceof OAuthFailedException) throw err;
            throw new OAuthFailedException(AUTH_OAUTH.PROVIDERS.GOOGLE);
        }

        // Step 2 - fetch profile (then immediately discard access token)
        try {
            const profileRes = await axios.get<{
                sub: string;
                email: string;
                name: string;
                picture: string | null;
            }>(AUTH_OAUTH.URLS.GOOGLE_PROFILE, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });

            const { sub, email, name, picture } = profileRes.data;

            return {
                provider_user_id: sub,
                email: email.toLowerCase().trim(),
                name,
                avatar_url: picture ?? null,
            };
        } catch {
            throw new OAuthFailedException(AUTH_OAUTH.PROVIDERS.GOOGLE);
        }
        // accessToken is not stored or returned - garbage collected here
    }

    /**
     * Perform GitHub OAuth code exchange and profile lookup.
     *
     * @param code GitHub authorization code.
     * @returns Normalized GitHub profile.
     */

    private async exchangeGithub(code: string): Promise<OAuthProfile> {
        // Step 1 - exchange code for access token
        let accessToken: string;
        try {
            const tokenRes = await axios.post<string>(
                AUTH_OAUTH.URLS.GITHUB_TOKEN,
                {
                    code,
                    client_id: this.config.get<string>(
                        AUTH_OAUTH.ENV_KEYS.GITHUB_CLIENT_ID,
                    ),
                    client_secret: this.config.get<string>(
                        AUTH_OAUTH.ENV_KEYS.GITHUB_CLIENT_SECRET,
                    ),
                },
                { headers: { Accept: AUTH_OAUTH.HEADERS.JSON_ACCEPT } },
            );

            // GitHub returns JSON when Accept: application/json is set
            const body = tokenRes.data as unknown as {
                access_token?: string;
                error?: string;
            };

            if (body.error || !body.access_token) {
                throw new OAuthFailedException(AUTH_OAUTH.PROVIDERS.GITHUB);
            }

            accessToken = body.access_token;
        } catch (err) {
            if (err instanceof OAuthFailedException) throw err;
            throw new OAuthFailedException(AUTH_OAUTH.PROVIDERS.GITHUB);
        }

        // Step 2 - fetch profile
        try {
            const [userRes, emailsRes] = await Promise.all([
                axios.get<{
                    id: number;
                    login: string;
                    name: string | null;
                    avatar_url: string | null;
                    email: string | null;
                }>(AUTH_OAUTH.URLS.GITHUB_PROFILE, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        Accept: AUTH_OAUTH.HEADERS.GITHUB_ACCEPT,
                    },
                }),
                // Primary email may be private - fetch from /user/emails
                axios.get<
                    { email: string; primary: boolean; verified: boolean }[]
                >(AUTH_OAUTH.URLS.GITHUB_EMAILS, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        Accept: AUTH_OAUTH.HEADERS.GITHUB_ACCEPT,
                    },
                }),
            ]);

            const { id, login, name, avatar_url } = userRes.data;

            // Prefer the primary verified email
            const primaryEmail =
                emailsRes.data.find((e) => e.primary && e.verified)?.email ??
                emailsRes.data.find((e) => e.primary)?.email ??
                userRes.data.email ??
                null;

            if (!primaryEmail) {
                throw new OAuthFailedException(AUTH_OAUTH.PROVIDERS.GITHUB);
            }

            return {
                provider_user_id: String(id),
                email: primaryEmail.toLowerCase().trim(),
                name: name ?? login,
                avatar_url: avatar_url ?? null,
            };
        } catch (err) {
            if (err instanceof OAuthFailedException) throw err;
            throw new OAuthFailedException(AUTH_OAUTH.PROVIDERS.GITHUB);
        }
        // accessToken is not stored or returned - garbage collected here
    }
}
