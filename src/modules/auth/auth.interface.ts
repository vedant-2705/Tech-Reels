/**
 * @module modules/auth/auth.interface
 * @description
 * Payload type contracts for the Auth module.
 * Auth dispatches two queue jobs and publishes two transactional events.
 */

// ---------------------------------------------------------------------------
// Job payloads dispatched by Auth
// ---------------------------------------------------------------------------

export interface WelcomeEmailJobPayload {
    userId: string;
}

export interface NewUserJobPayload {
    userId: string;
    reason: string;
}

// ---------------------------------------------------------------------------
// Event payloads published by Auth (transactional channel)
// ---------------------------------------------------------------------------

export interface UserRegisteredEventPayload {
    userId: string;
}

export interface UserLoggedInEventPayload {
    userId: string;
}

export interface UserLoggedOutEventPayload {
    userId: string;
}
