import { UserModel } from './user.model';
import { User } from '../schemas/user.schema';
import { OmitType } from '@nestjs/mapped-types';

export class UserSanitizedModel extends OmitType(UserModel, ['password']) {}

export class UserSanitized extends OmitType(User, ['password']) {}
