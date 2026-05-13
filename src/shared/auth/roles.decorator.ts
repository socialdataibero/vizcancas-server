import { SetMetadata } from '@nestjs/common';
import { UserRoleEnum, UserRoleType } from 'src/modules/users/enums/user-role.enum';

export const Roles = (...roles: Array<UserRoleEnum | UserRoleType>) =>
  SetMetadata('roles', roles);
