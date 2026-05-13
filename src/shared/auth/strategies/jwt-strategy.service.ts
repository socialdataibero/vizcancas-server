import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from '../auth.service';
import { JwtPayload } from '../jwt-payload.model';
import { UsersService } from 'src/modules/users/user.service';
import { ConfigService } from 'src/shared/config/config.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly _authService: AuthService,
    readonly _configService: ConfigService,
    private _usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: _configService.getJwtConfig().secret,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this._authService.validateUser(payload);

    if (!user) {
      throw new HttpException('USER_NOT_FOUND', HttpStatus.UNAUTHORIZED);
    }

    return this._usersService.sanitizeUser(user);
  }
}