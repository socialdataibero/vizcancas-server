import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { sign, SignOptions } from 'jsonwebtoken';
import { JwtPayload } from './jwt-payload.model';
import { UsersService } from 'src/modules/users/user.service';
import { User } from 'src/modules/users/schemas/user.schema';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '../config/config.service';
@Injectable()
export class AuthService {
  private readonly jwtOptions: SignOptions;
  private readonly jwtKey: string;
  constructor(
    @Inject(forwardRef(() => UsersService))
    readonly _userService: UsersService,
    readonly _configService: ConfigService,
  ) {
    this.jwtOptions = { expiresIn: '12h' };
    this.jwtKey = _configService.getJwtConfig().secret;
  }
  signPayload(payload: JwtPayload) {
    return sign(payload, this.jwtKey, this.jwtOptions);
  }
  validateUser(validatePayload: JwtPayload): Promise<User | null> {
    return this._userService.findOne({
      username: validatePayload.username.toLowerCase(),
    });
  }
  verifyToken(token: string): any {
    return jwt.verify(token, this.jwtKey);
  }
}
