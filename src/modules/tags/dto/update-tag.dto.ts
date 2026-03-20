/**
 * @module modules/tags/dto/update-tag.dto
 * @description
 * Request DTO for PATCH /tags/:id. Admin-only endpoint that updates a tag's
 * name or category. All fields are optional - only provided fields are updated
 * (COALESCE pattern in the repository).
 */

import { ApiProperty } from "@nestjs/swagger";
import {
    IsIn,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    MinLength,
} from "class-validator";
import { TAG_CATEGORIES, type TagCategory } from "../tags.constants";

/**
 * Payload for partially updating an existing tag.
 * At least one field should be provided, though neither is required at the
 * validation layer - sending an empty body is a no-op update.
 */
export class UpdateTagDto {
    /**
     * New tag name. Lowercase letters, numbers, and hyphens only.
     * If the submitted name matches the tag's current name, no conflict
     * is raised (ownership-aware check via existsByNameForOtherTag).
     */
    @ApiProperty({
        example: "react-native",
        description:
            "New tag name. Lowercase letters, numbers, and hyphens only. " +
            "Must be unique across all other tags.",
        minLength: 2,
        maxLength: 50,
        required: false,
    })
    @IsOptional()
    @IsString()
    @MinLength(2)
    @MaxLength(50)
    @Matches(/^[a-z0-9-]+$/, {
        message:
            "name may only contain lowercase letters, numbers, and hyphens",
    })
    name?: string;

    /**
     * New category for this tag. Must be one of the canonical categories.
     */
    @ApiProperty({
        example: "frontend",
        description: "New tag category.",
        enum: TAG_CATEGORIES,
        required: false,
    })
    @IsOptional()
    @IsString()
    @IsIn([...TAG_CATEGORIES], {
        message: `category must be one of: ${TAG_CATEGORIES.join(", ")}`,
    })
    category?: TagCategory;
}
