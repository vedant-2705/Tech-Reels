/**
 * @module modules/reels/dto/watch-reel.dto
 * @description
 * Request body DTO for POST /reels/:id/watch.
 * Captures watch telemetry published asynchronously via Pub/Sub.
 */

import { IsInt, IsNumber, Max, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

/**
 * Watch telemetry payload for a single reel view session.
 */
export class WatchReelDto {
    @ApiProperty({
        example: 45,
        description:
            "Total seconds the viewer watched before closing or completing the reel. Must be >= 0.",
    })
    @IsInt()
    @Min(0)
    watch_duration_secs!: number;

    @ApiProperty({
        example: 80,
        description: "Percentage of the reel that was watched (0-100).",
        minimum: 0,
        maximum: 100,
    })
    @IsNumber()
    @Min(0)
    @Max(100)
    completion_pct!: number;
}
