import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { IsObject } from 'class-validator';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { CanvasesService } from './canvases.service';

class SaveCanvasDto {
  @IsObject()
  state!: Record<string, unknown>;
}

@UseGuards(JwtAuthGuard)
@Controller('canvases')
export class CanvasesController {
  constructor(private readonly service: CanvasesService) {}

  @Get('mine')
  async getMine(@Req() req) {
    return (await this.service.getMine(req.user.username)) ?? { state: null };
  }

  @Put('mine')
  saveMine(@Req() req, @Body() dto: SaveCanvasDto) {
    return this.service.saveMine(req.user.username, dto.state);
  }
}
