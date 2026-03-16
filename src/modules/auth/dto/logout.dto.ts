/**
 * @module modules/auth/dto/logout.dto
 * @description
 * Request DTO for revoking a single authenticated session by token family.
 */

import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

/**
 * Validates the token-family identifier used for single-session logout.
 */
export class LogoutDto {
    @ApiProperty({
        example: '019501a0-0000-7000-8000-000000000001',
        description:
        'The token family UUID of the session to terminate. ' +
        'Only this session is affected — other active sessions remain valid.',
    })
    @IsUUID("7")
    token_family!: string;
}
