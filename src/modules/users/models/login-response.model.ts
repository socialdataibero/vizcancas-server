import { UserSanitizedModel } from './user.sanitized.model';

export class LoginResponse {
  token!: string;
  user!: UserSanitizedModel;
}
