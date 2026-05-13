import { IsOptional, IsString } from "class-validator";

export class UpdateUserDto {
  @IsOptional()
  @IsString({ message: 'USERNAME_MUST_BE_STRING' })
  username?: string;

  @IsOptional()
  @IsString({ message: 'LOGO_URL_MUST_BE_STRING' })
  logoUrl?: string;

  @IsOptional()
  @IsString({ message: 'ROLE_MUST_BE_STRING' })
  role?: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString({ message: 'NAME_MUST_BE_STRING' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'LOGO_URL_MUST_BE_STRING' })
  logoUrl?: string;
}