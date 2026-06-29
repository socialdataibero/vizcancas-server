import { UserRoleEnum } from 'src/modules/users/enums/user-role.enum';

export interface JwtPayload {
  username: string;
  role: UserRoleEnum;
  source?: 'ckan';
  iat?: Date;
}
