/**
 * @module modules/users/dto/username-check-response.dto
 * @description
 * Response DTO for GET /users/me/check-username. Returns whether the
 * queried username is available for the authenticated user to take.
 */

import { ApiProperty } from "@nestjs/swagger";

/**
 * Username availability check response envelope.
 */
export class UsernameCheckResponseDto {
    @ApiProperty({
        example: "alice_dev",
        description: "The username that was checked.",
    })
    username!: string;

    @ApiProperty({
        example: true,
        description:
            "True when the username is available. " +
            "Also true when the username already belongs to the requesting user " +
            "(so the update form does not show a false conflict on their own username).",
    })
    available!: boolean;
}
