/**
 * @module modules/feed/feed.messaging
 * @description
 * Messaging manifest for the Feed module.
 *
 * Feed owns ALL jobs that land in QUEUES.FEED_BUILD and QUEUES.AFFINITY_UPDATE.
 * Consumer modules (Auth, Users, Reels) reference this manifest when they
 * need to trigger a feed operation — they never declare these job strings
 * in their own manifests.
 */

import { ModuleMessagingManifest } from "@modules/messaging/messaging.types";
import { QUEUES } from "src/queues/queue-names";

export const FEED_MANIFEST = {
    jobs: {
        /**
         * Dispatched by Feed affinity event handlers.
         * Consumed by AffinityUpdateWorker.
         */
        AFFINITY_UPDATE: {
            jobName: "affinity_update",
            queue: QUEUES.AFFINITY_UPDATE,
        },

        /**
         * Dispatched by FeedInteractionsSubscriber when FEED_LOW event fires.
         * Consumed by FeedBuildWorker with reason="feed_low".
         */
        FEED_LOW_REBUILD: {
            jobName: "feed_low",
            queue: QUEUES.FEED_BUILD,
        },

        /**
         * Dispatched by Auth after a new user registers.
         * Consumed by FeedBuildWorker with reason="new_user".
         */
        NEW_USER_REGISTERED: {
            jobName: "new_user",
            queue: QUEUES.FEED_BUILD,
        },

        /**
         * Dispatched by Users when a user's experience_level changes.
         * Consumed by FeedBuildWorker with reason="rebuild".
         */
        FEED_REBUILD: {
            jobName: "rebuild",
            queue: QUEUES.FEED_BUILD,
        },

        /**
         * Dispatched by Reels when the feed cache is empty (cold start).
         * Consumed by FeedBuildWorker with reason="cold_start".
         */
        FEED_COLD_START: {
            jobName: "cold_start",
            queue: QUEUES.FEED_BUILD,
        },

        /**
         * Dispatched by Reels when a user performs a search.
         * Consumed by FeedBuildWorker with reason="search".
         */
        FEED_SEARCH: {
            jobName: "search",
            queue: QUEUES.FEED_BUILD,
        },

        /**
         * Dispatched by Reels when a user shares a reel.
         * Consumed by FeedBuildWorker with reason="share".
         */
        FEED_SHARE: {
            jobName: "share",
            queue: QUEUES.FEED_BUILD,
        },
    },
} as const satisfies ModuleMessagingManifest;
