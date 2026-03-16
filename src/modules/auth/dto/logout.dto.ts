import { IsUUID } from "class-validator";

export class LogoutDto {
    @IsUUID("7")
    token_family!: string;
}
