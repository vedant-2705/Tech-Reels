/**
 * @module modules/admin/dto/user-search-query.dto
 * @description
 * Query parameters DTO for GET /admin/users.
 */

import {
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { ADMIN_USER_STATUSES, type AdminUserStatus } from "../admin.constants";

/**
 * Query params for the admin user list endpoint.
 */
export class UserSearchQueryDto {
    @ApiPropertyOptional({
        example: "alice",
        description:
            "Free-text search matched against email and username via ILIKE.",
        maxLength: 100,
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    @Transform(({ value }) => (value as string)?.trim())
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
        example: "019501a0-0000-7000-8000-000000000001",
        description:
            "UUID v7 cursor for keyset pagination (exclusive - returns rows after this ID).",
    })
    @IsOptional()
    @IsUUID()
    cursor?: string;

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
    limit?: number = 50;
}
