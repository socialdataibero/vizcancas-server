import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsObject } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { SharesService } from './shares.service';

class CreateShareDto {
  @IsObject()
  snapshot!: Record<string, unknown>;
}

@Controller('shares')
export class SharesController {
  constructor(private readonly service: SharesService) {}

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post()
  @HttpCode(HttpStatus.OK)
  create(@Req() req, @Body() dto: CreateShareDto) {
    return this.service.create(req.user.username, dto.snapshot);
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':token')
  claim(@Param('token') token: string) {
    return this.service.claim(token);
  }
}
