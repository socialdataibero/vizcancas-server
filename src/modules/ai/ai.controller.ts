import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AiService } from './ai.service';
import { AiChatDto } from './dto/ai-chat.dto';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private service: AiService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('chat')
  chat(@Body() dto: AiChatDto) {
    return this.service.chat(dto);
  }
}
