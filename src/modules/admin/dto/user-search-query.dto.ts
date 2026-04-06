/**
 * @module modules/admin/dto/user-search-query.dto
 * @description
 * Query parameters DTO for GET /admin/users.
 * Extends CursorPaginationDto for standard cursor + limit.
 * Overrides default limit to 50 (admin endpoints show more items per page).
 */

import {
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { CursorPaginationDto } from "@common/dto/cursor-pagination.dto";
import { ADMIN_USER_STATUSES, type AdminUserStatus } from "../admin.constants";

/**
 * Query params for the admin user list endpoint.
 */
export class UserSearchQueryDto extends CursorPaginationDto {
    @ApiPropertyOptional({
        example: "alice",
        description:
            "Free-text search matched against email and username via ILIKE.",
        maxLength: 100,
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    q?: string;

    @ApiPropertyOptional({
        example: "active",
        description: "Filter by account_status.",
        enum: ADMIN_USER_STATUSES,
    })
    @IsOptional()
    @IsEnum(ADMIN_USER_STATUSES)
    status?: AdminUserStatus;

    @ApiPropertyOptional({
        example: "user",
        description: 'Filter by role. Accepts "user" or "admin".',
    })
    @IsOptional()
    @IsString()
    role?: string;

    @ApiPropertyOptional({
        example: 50,
        description: "Number of users to return per page. Default 50, max 100.",
        minimum: 1,
        maximum: 100,
        default: 50,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    override limit?: number = 50;
}
