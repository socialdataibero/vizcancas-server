import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { UserRoleEnum } from '../enums/user-role.enum';

export class UpdateUserAccessDto {
  @IsOptional()
  @IsEnum(UserRoleEnum)
  role?: UserRoleEnum;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}