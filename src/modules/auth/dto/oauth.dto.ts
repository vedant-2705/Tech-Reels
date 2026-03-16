import { IsNotEmpty, IsString } from "class-validator";

export class OAuthDto {
    @IsString()
    @IsNotEmpty()
    code!: string;
}
