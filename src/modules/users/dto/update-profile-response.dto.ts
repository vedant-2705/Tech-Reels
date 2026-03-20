/**
 * @module modules/users/dto/update-profile-response.dto
 * @description
 * Response DTO returned by PATCH /users/me after a successful profile
 * update. Contains only the fields that are mutable by this endpoint.
 */

import { ApiProperty } from "@nestjs/swagger";
import { EXPERIENCE_LEVELS } from "@modules/auth/entities/user.entity";

/**
 * Profile update response envelope.
 */
export class UpdateProfileResponseDto {
    @ApiProperty({ example: "019501a0-0000-7000-8000-000000000001" })
    id!: string;

    @ApiProperty({ example: "alice_dev" })
    username!: string;

    @ApiProperty({
        example: "Full-stack engineer passionate about distributed systems.",
        nullable: true,
    })
    bio!: string | null;

    @ApiProperty({ example: "intermediate", enum: EXPERIENCE_LEVELS })
    experience_level!: string;

    @ApiProperty({ example: "2026-03-16T10:00:00.000Z" })
    updated_at!: string;
}
