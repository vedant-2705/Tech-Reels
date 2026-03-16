import { IsNotEmpty, IsString, IsUUID } from "class-validator";

export class RefreshTokenDto {
    @IsString()
    @IsNotEmpty()
    refresh_token!: string;

    @IsUUID("7")
    token_family!: string;
}
