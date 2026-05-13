import { Global, Module } from '@nestjs/common';
import { DuckdbService } from './duckdb.service';

@Global()
@Module({
  providers: [DuckdbService],
  exports: [DuckdbService],
})
export class DuckdbModule {}
