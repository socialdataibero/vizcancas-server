import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { DuckdbService } from '../duckdb/duckdb.service';
import { ExecuteQueryDto, ExecuteQueryLimitedDto } from './dto/execute-query.dto';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { assertReadOnlySql } from './read-only-sql';

@UseGuards(JwtAuthGuard)
@Controller('query')
export class QueryController {
  constructor(private readonly duckdb: DuckdbService) {}

  @Post('execute')
  @HttpCode(HttpStatus.OK)
  execute(@Body() dto: ExecuteQueryDto) {
    assertReadOnlySql(dto.sql);
    return this.duckdb.executeQuery(dto.sql);
  }

  @Post('execute-limited')
  @HttpCode(HttpStatus.OK)
  executeLimited(@Body() dto: ExecuteQueryLimitedDto) {
    assertReadOnlySql(dto.sql);
    return this.duckdb.executeQueryLimited(dto.sql, dto.limit ?? 250);
  }
}
