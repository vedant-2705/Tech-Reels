/**
 * @module modules/tags/dto/create-tag.dto
 * @description
 * Request DTO for POST /tags. Admin-only endpoint that creates a new tag
 * in the catalogue. Both fields are required.
 */

import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { TAG_CATEGORIES, type TagCategory } from "../tags.constants";

/**
 * Payload required to create a new tag.
 */
export class CreateTagDto {
    /**
     * Tag name - lowercase letters, numbers, and hyphens only.
     * Must be unique across all tags in the catalogue.
     */
    @ApiProperty({
        example: "react",
        description:
            "Tag name. Lowercase letters, numbers, and hyphens only. " +
            "Must be unique across all tags.",
        minLength: 2,
        maxLength: 50,
    })
    @IsString()
    @MinLength(2)
    @MaxLength(50)
    @Matches(/^[a-z0-9-]+$/, {
        message:
            "name may only contain lowercase letters, numbers, and hyphens",
    })
    name!: string;

    /**
     * Category this tag belongs to. Must be one of the canonical categories
     * defined in TAG_CATEGORIES.
     */
    @ApiProperty({
        example: "frontend",
        description: "Tag category.",
        enum: TAG_CATEGORIES,
    })
    @IsString()
    @IsIn([...TAG_CATEGORIES], {
        message: `category must be one of: ${TAG_CATEGORIES.join(", ")}`,
    })
    category!: TagCategory;
}
