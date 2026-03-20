/**
 * @module modules/users/dto/badges-response.dto
 * @description
 * Response DTO for GET /users/me/badges. Returns all badges earned by
 * the authenticated user, ordered by earned_at DESC.
 */

import { ApiProperty } from "@nestjs/swagger";

/**
 * Full badge entry shape as seen by the account owner.
 */
export class BadgeEntryDto {
    @ApiProperty({ example: "019501a0-0000-7000-8000-000000000001" })
    id!: string;

    @ApiProperty({ example: "streak_7" })
    code!: string;

    @ApiProperty({ example: "7-Day Streak" })
    name!: string;

    @ApiProperty({ example: "Watched reels 7 days in a row." })
    description!: string;

    @ApiProperty({ example: "https://cdn.techreel.io/badges/streak_7.png" })
    icon_url!: string;

    @ApiProperty({ example: "2026-02-01T00:00:00.000Z" })
    earned_at!: string;
}

/**
 * Badges collection metadata.
 */
export class BadgesMetaDto {
    @ApiProperty({ example: 5 })
    total_earned!: number;
}

/**
 * Badges response envelope.
 */
export class BadgesResponseDto {
    @ApiProperty({ type: () => [BadgeEntryDto] })
    data!: BadgeEntryDto[];

    @ApiProperty({ type: () => BadgesMetaDto })
    meta!: BadgesMetaDto;
}
