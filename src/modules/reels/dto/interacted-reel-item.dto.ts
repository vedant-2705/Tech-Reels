/**
 * @module modules/reels/dto/interacted-reel-item.dto
 * @description
 * Extends ReelResponseDto with interaction flags for liked and saved
 * reel list endpoints. Shared between both lists.
 */

import { ApiProperty } from "@nestjs/swagger";
import { ReelResponseDto } from "./reel-response.dto";

/**
 * Reel item returned by GET /reels/liked and GET /reels/saved.
 * Always carries both is_liked and is_saved flags.
 * On the liked list: is_liked is always true, is_saved is fetched.
 * On the saved list: is_saved is always true, is_liked is fetched.
 */
export class InteractedReelItemDto extends ReelResponseDto {
    @ApiProperty({
        example: true,
        description: "Whether the authenticated user has liked this reel.",
    })
    is_liked!: boolean;

    @ApiProperty({
        example: false,
        description: "Whether the authenticated user has saved this reel.",
    })
    is_saved!: boolean;
}
