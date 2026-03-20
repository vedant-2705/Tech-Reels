/**
 * @module modules/users/dto/xp-history-response.dto
 * @description
 * Response DTO for GET /users/me/xp-history. Returns a cursor-paginated
 * slice of the XP ledger alongside the user's running total XP.
 */

import { ApiProperty } from "@nestjs/swagger";

/**
 * Single XP ledger entry shape.
 */
export class XpLedgerEntryDto {
    @ApiProperty({ example: "019501a0-0000-7000-8000-000000000001" })
    id!: string;

    @ApiProperty({
        example: 50,
        description: "XP delta. Positive = earned, negative = deducted.",
    })
    delta!: number;

    @ApiProperty({
        example: "challenge_correct",
        description:
            "Source of the XP event: challenge_correct | reel_watch | streak_bonus | path_completed | admin_grant.",
    })
    source!: string;

    @ApiProperty({
        example: "019501a0-0000-7000-8000-000000000002",
        nullable: true,
        description:
            "Reference ID linking this entry to the originating entity.",
    })
    reference_id!: string | null;

    @ApiProperty({
        example: "Correct answer on first attempt.",
        nullable: true,
    })
    note!: string | null;

    @ApiProperty({ example: "2026-03-16T10:00:00.000Z" })
    created_at!: string;
}

/**
 * XP history pagination metadata.
 */
export class XpHistoryMetaDto {
    @ApiProperty({
        example: "019501a0-0000-7000-8000-000000000020",
        nullable: true,
        description:
            "UUID of the last returned entry. Pass as `cursor` to fetch the next page. " +
            "Null when no more results.",
    })
    next_cursor!: string | null;

    @ApiProperty({ example: true })
    has_more!: boolean;

    @ApiProperty({ example: 1500 })
    total_xp!: number;
}

/**
 * XP history paginated response envelope.
 */
export class XpHistoryResponseDto {
    @ApiProperty({ type: () => [XpLedgerEntryDto] })
    data!: XpLedgerEntryDto[];

    @ApiProperty({ type: () => XpHistoryMetaDto })
    meta!: XpHistoryMetaDto;
}
