import { UserRoleEnum } from '../enums/user-role.enum';

export class UserModel {
  name!: string;
  username!: string;
  password!: string;
  logoUrl?: string;
  role!: UserRoleEnum;
  createdAt?: Date;
  updatedAt?: Date;
}
