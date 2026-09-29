import { UserSanitizedModel } from './user.sanitized.model';

export class LoginResponse {
  token!: string;
  user!: UserSanitizedModel;
  ckanDownloadToken?: string;
  iberoContext?: Record<string, unknown> | null;
  canvas?: Record<string, unknown> | null;
}
