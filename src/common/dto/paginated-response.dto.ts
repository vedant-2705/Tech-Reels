/**
 * @module common/dto/paginated-response.dto
 * @description
 * A generic DTO for paginated responses using cursor-based pagination.
 * Contains an array of data items and metadata for pagination.
 */

export class PaginatedResponseDto<T> {
    data!: T[];
    meta!: {
        next_cursor: string | null;
        has_more: boolean;
    };
}
