import {
  Body,
  Controller,
  Post,
} from '@nestjs/common';

import { AiService } from './ai.service';
import { AiChatDto } from './dto/ai-chat.dto';

@Controller('ai')
export class AiController {
  constructor(private service: AiService) { }

  @Post('chat')
  // @UseGuards(JwtAuthGuard)
  chat(@Body() dto: AiChatDto) {
    console.log(dto)
    return this.service.chat(dto);
  }
}
