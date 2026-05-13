import { Type } from 'class-transformer';
import { IsInt, Min, IsOptional, IsString, IsIn } from 'class-validator';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  sortBy?: string = '_id';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDirection?: 'asc' | 'desc' = 'desc';

  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @IsString()
  role?: string;

  @IsOptional()
  isActive?: string;
}