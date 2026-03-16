/**
 * @module common/dto/cursor-pagination.dto
 * @description
 * Query DTO for UUID v7 cursor-based pagination.
 *
 * Contract:
 * - `cursor` is optional and must be a UUID v7 when provided.
 * - `limit` is optional, defaults to `20`, and must be an integer in `[1, 50]`.
 */

import { IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";
import { Type } from "class-transformer";

export class CursorPaginationDto {
    @IsOptional()
    @IsUUID("7")
    cursor?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    limit?: number = 20;
}
