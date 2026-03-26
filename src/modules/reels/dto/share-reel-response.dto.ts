/**
 * @module modules/reels/dto/share-reel-response.dto
 * @description
 * Response DTO for POST /reels/:id/share.
 */

import { ApiProperty } from "@nestjs/swagger";

/**
 * Response returned after a successful reel share action.
 */
export class ShareReelResponseDto {
    @ApiProperty({
        example: true,
        description: "Confirms the share was recorded successfully.",
    })
    shared!: boolean;

    @ApiProperty({
        example:
            "https://app.techreel.io/reels/019501a0-0000-7000-8000-000000000001",
        description: "Shareable deep-link URL for this reel.",
    })
    share_url!: string;
}
