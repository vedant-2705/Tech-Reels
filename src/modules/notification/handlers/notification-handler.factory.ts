/**
 * Factory for creating appropriate notification handlers.
 * Implements the Factory pattern to instantiate the right handler based on notification type.
 */

import { Injectable, Logger } from '@nestjs/common';
import { NotificationHandler } from './notification.handler';
import { AdminMessageHandler } from './admin-message.handler';
import { PathCompletedHandler } from './path-completed.handler';
import { NotificationType } from '../notification.constants';

/**
 * Factory that creates the appropriate handler for a given notification type.
 */
@Injectable()
export class NotificationHandlerFactory {
    private readonly logger = new Logger(NotificationHandlerFactory.name);
    private readonly handlers: Map<string, NotificationHandler>;

    constructor(
        adminMessageHandler: AdminMessageHandler,
        pathCompletedHandler: PathCompletedHandler,
    ) {
        // Register all handlers
        this.handlers = new Map();
        this.handlers.set(adminMessageHandler.getType(), adminMessageHandler);
        this.handlers.set(pathCompletedHandler.getType(), pathCompletedHandler);

        this.logger.debug(
            `[NotificationHandlerFactory] Registered ${this.handlers.size} notification handlers`,
        );
    }

    /**
     * Get the handler for a specific notification type.
     * @param type The notification type
     * @returns The handler, or throws if type not found
     */
    getHandler(type: NotificationType): NotificationHandler {
        const handler = this.handlers.get(type);
        if (!handler) {
            this.logger.warn(
                `[NotificationHandlerFactory] No handler registered for type "${type}"`,
            );
            throw new Error(`No notification handler registered for type: ${type}`);
        }
        return handler;
    }

    /**
     * Check if a handler exists for the given type.
     */
    hasHandler(type: NotificationType): boolean {
        return this.handlers.has(type);
    }
}
