/**
 * @module common/dto/cursor-pagination.dto
 * @description
 * Base query DTO for UUID v7 cursor-based pagination.
 * All paginated endpoints should extend this class instead of
 * hand-rolling cursor + limit properties.
 *
 * Contract:
 * - `cursor` is optional and must be a valid UUID when provided.
 * - `limit` is optional, defaults to `20`, and must be an integer in `[1, 50]`.
 *
 * Module-specific DTOs extend this and add their own filters (e.g. status, difficulty).
 */

import { IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

export class CursorPaginationDto {
    @ApiPropertyOptional({
        description:
            "UUID cursor from the last item returned in the previous page. Omit for the first page.",
        example: "019501a0-0000-7000-8000-000000000001",
    })
    @IsOptional()
    @IsUUID()
    cursor?: string;

    @ApiPropertyOptional({
        description:
            "Maximum number of items to return per page. Default 20, max 50.",
        example: 20,
        minimum: 1,
        maximum: 50,
        default: 20,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    limit?: number = 20;
}
