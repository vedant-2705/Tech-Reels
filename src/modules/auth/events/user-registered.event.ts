/**
 * @module modules/auth/events/user-registered.event
 * @description
 * Event payload types published by the auth module on the transactional
 * pub/sub channel.
 */

import { AUTH_MODULE_CONSTANTS } from "../auth.constants";

/**
 * Event emitted after a successful authentication or session creation.
 */
export interface UserLoggedInEvent {
    event: typeof AUTH_MODULE_CONSTANTS.USER_LOGGED_IN;
    userId: string;
    timestamp: string; // ISO 8601
}

/**
 * Event emitted after a user logs out from a session.
 */
export interface UserLoggedOutEvent {
    event: typeof AUTH_MODULE_CONSTANTS.USER_LOGGED_OUT;
    userId: string;
    timestamp: string; // ISO 8601
}

/**
 * Union of auth-related pub/sub event payloads.
 */
export type AuthPubSubEvent = UserLoggedInEvent | UserLoggedOutEvent;

// Pub/Sub channel name
// export const TRANSACTIONAL_CHANNEL = "transactional";
