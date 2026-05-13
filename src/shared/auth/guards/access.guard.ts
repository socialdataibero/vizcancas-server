import { CanActivate, ExecutionContext, Injectable, HttpException, HttpStatus } from '@nestjs/common';

@Injectable()
export class ActiveGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (user && user.isActive === false) {
      throw new HttpException('ACCOUNT_SUSPENDED', HttpStatus.FORBIDDEN);
    }

    return true; 
  }
}