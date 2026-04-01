/**
 * @module modules/admin/dto/admin-user-list-item.dto
 * @description
 * Response shape for a single user row in GET /admin/users list,
 * and the paginated wrapper returned by that endpoint.
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Single user item in the admin user list response.
 */
export class AdminUserListItemDto {
    @ApiProperty({
        example: "019501a0-0000-7000-8000-000000000001",
        description: "User UUID v7.",
    })
    id!: string;

    @ApiProperty({
        example: "alice@example.com",
        description: "User email address.",
    })
    email!: string;

    @ApiProperty({
        example: "alice_dev",
        description: "Unique username.",
    })
    username!: string;

    @ApiProperty({
        example: "user",
        description: 'User role. Either "user" or "admin".',
    })
    role!: string;

    @ApiProperty({
        example: "active",
        description: "Account status (active, suspended, banned, deactivated).",
    })
    account_status!: string;

    @ApiProperty({
        example: 1240,
        description: "Total XP earned by the user.",
    })
    total_xp!: number;

    @ApiProperty({
        example: 7,
        description: "Current daily streak in days.",
    })
    current_streak!: number;

    @ApiProperty({
        example: "2026-03-01T10:00:00.000Z",
        description: "ISO 8601 account creation timestamp.",
    })
    created_at!: string;

    @ApiPropertyOptional({
        example: "2026-03-31",
        description: "Date the user was last active. Null if never active.",
        nullable: true,
    })
    last_active_date!: string | null;
}

/**
 * Pagination metadata for the admin user list.
 */
export class AdminUserListMetaDto {
    @ApiPropertyOptional({
        example: "019501a0-0000-7000-8000-000000000099",
        description:
            "Cursor UUID to pass for the next page. Null when no more results.",
        nullable: true,
    })
    next_cursor!: string | null;

    @ApiProperty({
        example: true,
        description: "Whether more results exist beyond this page.",
    })
    has_more!: boolean;

    @ApiProperty({
        example: 142,
        description: "Total number of users matching the current filters.",
    })
    total_count!: number;
}

/**
 * Paginated admin user list response.
 */
export class AdminUserListResponseDto {
    @ApiProperty({
        type: [AdminUserListItemDto],
        description: "Array of user list items.",
    })
    data!: AdminUserListItemDto[];

    @ApiProperty({
        type: () => AdminUserListMetaDto,
        description: "Pagination metadata.",
    })
    meta!: AdminUserListMetaDto;
}
