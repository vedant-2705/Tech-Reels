/**
 * @module common/dto/api-error.dto
 * @description
 * Defines the ApiErrorDto class, which represents the standardized error response format
 * for the API. 
 */

import { ApiProperty } from "@nestjs/swagger";

/**
 * RFC 7807 Problem Details error response shape.
 * Used in @ApiResponse decorators across all controllers.
 *
 * All errors from this API conform to this shape.
 */
export class ApiErrorDto {
    @ApiProperty({
        example: "https://techreel.io/errors/<error-code>",
        description: "Unique error type URI.",
    })
    type!: string;

    @ApiProperty({ example: "<Error Code>" })
    title!: string;

    @ApiProperty({ example: "<http-status-code>" })
    status!: number;

    @ApiProperty({ example: "<Error Detail>" })
    detail!: string;

    @ApiProperty({ example: "/api/v1/<endpoint>" })
    instance!: string;

    @ApiProperty({ example: "2026-03-16T10:00:00.000Z" })
    timestamp!: string;

    @ApiProperty({
        required: false,
        description: "Only present on 400 validation failures.",
        example: [{ field: "email", message: "must be a valid email" }],
        type: "array",
        items: {
            type: "object",
            properties: {
                field: { type: "string" },
                message: { type: "string" },
            },
        },
    })
    errors?: { field: string; message: string }[];
}
