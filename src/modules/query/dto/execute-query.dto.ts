import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ExecuteQueryDto {
  @IsString()
  sql: string;
}

export class ExecuteQueryLimitedDto {
  @IsString()
  sql: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;
}
