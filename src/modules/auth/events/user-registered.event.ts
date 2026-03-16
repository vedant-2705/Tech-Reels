/**
 * Pub/Sub event shapes published on the 'transactional' channel.
 *
 * Channel: transactional
 * Subscribers: Analytics Worker
 *
 * Usage in service:
 *   await this.redis.publish('transactional', JSON.stringify({
 *     event: 'USER_LOGGED_IN',
 *     userId,
 *     timestamp: new Date().toISOString(),
 *   }));
 */

import { AUTH_MODULE_CONSTANTS } from "../auth.constants";

export interface UserLoggedInEvent {
    event: typeof AUTH_MODULE_CONSTANTS.USER_LOGGED_IN;
    userId: string;
    timestamp: string; // ISO 8601
}

export interface UserLoggedOutEvent {
    event: typeof AUTH_MODULE_CONSTANTS.USER_LOGGED_OUT;
    userId: string;
    timestamp: string; // ISO 8601
}

export type AuthPubSubEvent = UserLoggedInEvent | UserLoggedOutEvent;

// Pub/Sub channel name
// export const TRANSACTIONAL_CHANNEL = "transactional";
