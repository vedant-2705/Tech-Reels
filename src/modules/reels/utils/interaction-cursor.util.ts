import { InteractedReel, InteractionCursor } from "../reels.repository";

/**
 * Decode a base64 compound cursor string into { timestamp, id }.
 * Returns undefined if cursor is absent, malformed, or missing required fields.
 * Never throws - invalid cursors are treated as first-page requests.
 *
 * @param raw Raw base64 cursor string from query params.
 * @returns Decoded InteractionCursor or undefined.
 */
export const decodeInteractionCursor = (raw?: string): InteractionCursor | undefined => {
    if (!raw) return undefined;
    try {
        const decoded = JSON.parse(
            Buffer.from(raw, 'base64').toString('utf8'),
        ) as { timestamp?: string; id?: string };
        if (!decoded.timestamp || !decoded.id) return undefined;
        return { timestamp: decoded.timestamp, id: decoded.id };
    } catch {
        return undefined;
    }
}

/**
 * Encode a compound cursor from the last row's interaction timestamp and reel ID.
 *
 * @param row Last InteractedReel row in the current page.
 * @returns Base64-encoded cursor string.
 */
export const encodeInteractionCursor = (row: InteractedReel): string => {
    return Buffer.from(
        JSON.stringify({ timestamp: row.lr_created_at, id: row.id }),
    ).toString('base64');
}