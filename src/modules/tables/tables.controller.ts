import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { DuckdbService, ColumnInfo } from '../duckdb/duckdb.service';

class ImportTableDto {
  @IsString()
  tableName: string;

  @IsArray()
  rows: Record<string, unknown>[];

  @IsArray()
  columns: ColumnInfo[];
}

@Controller('tables')
export class TablesController {
  constructor(private readonly duckdb: DuckdbService) {}

  @Get()
  listTables() {
    return this.duckdb.getTablesWithMeta();
  }

  @Get(':name/schema')
  async getSchema(@Param('name') name: string) {
    const tables = await this.duckdb.getTables();
    if (!tables.includes(name)) throw new NotFoundException(`Tabla no encontrada: ${name}`);
    return this.duckdb.getTableSchema(name);
  }

  @Get(':name/export')
  async exportTable(@Param('name') name: string) {
    const tables = await this.duckdb.getTables();
    if (!tables.includes(name)) throw new NotFoundException(`Tabla no encontrada: ${name}`);
    return this.duckdb.exportTableData(name);
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  importTable(@Body() dto: ImportTableDto) {
    return this.duckdb.importTableData(dto.tableName, dto.rows, dto.columns);
  }

  @Delete(':name')
  @HttpCode(HttpStatus.NO_CONTENT)
  async dropTable(@Param('name') name: string) {
    const tables = await this.duckdb.getTables();
    if (!tables.includes(name)) throw new NotFoundException(`Tabla no encontrada: ${name}`);
    await this.duckdb.dropTable(name);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  clearAllTables() {
    return this.duckdb.clearAllTables();
  }
}
