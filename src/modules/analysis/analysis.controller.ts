import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalysisService, SuggestedMapFlow } from './analysis.service';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysis: AnalysisService) {}

  @Get('map-flows')
  getMapFlows(@Query('tableName') tableName?: string): Promise<SuggestedMapFlow[]> {
    return this.analysis.getMapFlows(tableName ?? undefined);
  }
}
