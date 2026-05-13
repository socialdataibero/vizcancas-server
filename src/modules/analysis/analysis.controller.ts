import { Controller, Get, Query } from '@nestjs/common';
import { AnalysisService, SuggestedMapFlow } from './analysis.service';

@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysis: AnalysisService) {}

  @Get('map-flows')
  getMapFlows(@Query('tableName') tableName?: string): Promise<SuggestedMapFlow[]> {
    return this.analysis.getMapFlows(tableName ?? undefined);
  }
}
