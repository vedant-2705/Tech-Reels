/**
 * @module modules/auth/auth.constants
 * @description
 * Shared constants, type aliases, environment keys, TTL values, queue job
 * names, and provider metadata used by the auth module.
 */

/**
 * Auth module event names and shared pub/sub channel identifiers.
 */
export const AUTH_MODULE_CONSTANTS = {
    USER_LOGGED_IN: "USER_LOGGED_IN",
    USER_LOGGED_OUT: "USER_LOGGED_OUT",

    TRANSACTIONAL_CHANNEL: "transactional",
} as const;

/**
 * Redis key prefixes used by auth caching and session storage.
 */
export const AUTH_REDIS_KEYS = {
    TOKEN_VERSION_PREFIX: "token_version",
    LOGIN_ATTEMPTS_PREFIX: "login_attempts",
    REFRESH_TOKEN_PREFIX: "refresh",
} as const;

/**
 * JWT-related environment keys and algorithm identifiers.
 */
export const AUTH_JWT = {
    PUBLIC_KEY_ENV: "JWT_PUBLIC_KEY",
    PRIVATE_KEY_ENV: "JWT_PRIVATE_KEY",
    REFRESH_SECRET_ENV: "JWT_REFRESH_SECRET",
    ACCESS_TTL_ENV: "JWT_ACCESS_TTL",
    REFRESH_TTL_ENV: "JWT_REFRESH_TTL",
    ALGORITHM: "RS256",
    REFRESH_ALGORITHM: "HS256",
} as const;

/**
 * Auth-specific reusable error message constants.
 */
export const AUTH_ERRORS = {
    SESSION_INVALIDATED: "Session invalidated",
} as const;

/**
 * TTL values, in seconds, used by auth session and rate-limit logic.
 */
export const AUTH_TTL = {
    REFRESH_TOKEN_SECONDS: 2_592_000, // 30 days
    LOGIN_WINDOW_SECONDS: 900,        // 15 minutes
    ACCESS_TOKEN_SECONDS: 900,        // 15 minutes
} as const;

/**
 * Supported OAuth provider identifiers.
 */
export type OAuthProvider =
    (typeof AUTH_OAUTH.PROVIDERS)[keyof typeof AUTH_OAUTH.PROVIDERS];

/**
 * Provider metadata, endpoints, environment keys, and protocol constants
 * used during OAuth authentication.
 */
export const AUTH_OAUTH = {
    PROVIDERS: {
        GOOGLE: "google",
        GITHUB: "github",
    },
    URLS: {
        GOOGLE_TOKEN: "https://oauth2.googleapis.com/token",
        GOOGLE_PROFILE: "https://www.googleapis.com/oauth2/v3/userinfo",
        GITHUB_TOKEN: "https://github.com/login/oauth/access_token",
        GITHUB_PROFILE: "https://api.github.com/user",
        GITHUB_EMAILS: "https://api.github.com/user/emails",
    },
    ENV_KEYS: {
        GOOGLE_CLIENT_ID: "GOOGLE_CLIENT_ID",
        GOOGLE_CLIENT_SECRET: "GOOGLE_CLIENT_SECRET",
        GITHUB_CLIENT_ID: "GITHUB_CLIENT_ID",
        GITHUB_CLIENT_SECRET: "GITHUB_CLIENT_SECRET",
    },
    HEADERS: {
        JSON_CONTENT_TYPE: "application/json",
        JSON_ACCEPT: "application/json",
        GITHUB_ACCEPT: "application/vnd.github+json",
    },
    REDIRECT_URI_POSTMESSAGE: "postmessage",
    GRANT_TYPE_AUTHORIZATION_CODE: "authorization_code",
} as const;

/**
 * Bcrypt work factors used for password and refresh-token hashing.
 */
export const AUTH_BCRYPT_ROUNDS = {
    PASSWORD: 12,
    TOKEN: 10,
} as const;

/**
 * User-facing success messages returned by auth endpoints.
 */
export const AUTH_MESSAGES = {
    LOGGED_OUT: "Logged out successfully",
    ALL_SESSIONS_TERMINATED: "All sessions terminated",
} as const;

/**
 * Queue job names emitted by auth workflows.
 */
export const AUTH_QUEUE_JOBS = {
    WELCOME_EMAIL: "welcome_email",
    NEW_USER: "new_user",
} as const;