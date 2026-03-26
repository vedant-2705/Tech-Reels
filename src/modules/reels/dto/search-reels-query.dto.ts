/**
 * @module modules/reels/dto/search-reels-query.dto
 * @description
 * Query params DTO for GET /reels/search.
 * Validates the plain-text search query and integer cursor/limit.
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
    IsInt,
    IsString,
    Max,
    MaxLength,
    Min,
    MinLength,
} from "class-validator";
import { Type } from "class-transformer";

/**
 * Validated query parameters for the reel text search endpoint.
 */
export class SearchReelsQueryDto {
    @ApiProperty({
        example: "reactjs",
        description:
            "Plain-text search query matched against tag name and category.",
        minLength: 1,
        maxLength: 100,
    })
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    q!: string;

    @ApiPropertyOptional({
        example: 0,
        description: "Integer offset cursor for pagination. Defaults to 0.",
        default: 0,
    })
    @IsInt()
    @Min(0)
    @Type(() => Number)
    cursor?: number = 0;

    @ApiPropertyOptional({
        example: 10,
        description: "Number of results to return. Min 1, max 50.",
        default: 10,
    })
    @IsInt()
    @Min(1)
    @Max(50)
    @Type(() => Number)
    limit?: number = 10;
}
