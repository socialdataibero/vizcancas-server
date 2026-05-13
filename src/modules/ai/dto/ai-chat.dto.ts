import { IsArray, IsOptional, ValidateNested, IsString, IsIn, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

class MessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  content!: string;
}

export class AiChatDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageDto)
  messages!: MessageDto[];

  @IsOptional()
  @IsObject()
  context?: {
    tables?: { name: string; columns: { name: string; type: string }[] }[];
    nodeCount?: number;
    existingNodes?: {
      ref: string;
      type: string;
      status: 'idle' | 'running' | 'success' | 'error';
      summary: string;
      columns?: string[];
    }[];
  };
}