/**
 * Builds a cursor-paginated response envelope.
 *
 * Convention:
 * - cursor is the UUID v7 of the last item on the current page
 * - If items.length === limit, there are more pages
 * - next_cursor is null on the last page
 */

import { PaginatedResponseDto } from "../dto/paginated-response.dto";

export function buildCursorPage<T extends { id: string }>(
    items: T[],
    limit: number,
): PaginatedResponseDto<T> {
    const has_more = items.length === limit;
    return {
        data: items,
        meta: {
            next_cursor: has_more
                ? (items[items.length - 1]?.id ?? null)
                : null,
            has_more,
        },
    };
}
