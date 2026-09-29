import { BadGatewayException, BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import { DuckdbService } from '../duckdb/duckdb.service';
import { PublishAnalysisDto } from './dto/publish-analysis.dto';

@Injectable()
export class IberoService {
  private readonly logger = new Logger(IberoService.name);

  constructor(private readonly duckdb: DuckdbService) {}

  async publishAnalysis(dto: PublishAnalysisDto): Promise<unknown> {
    const apiUrl = this.resolveApiUrl(dto.apiUrl);
    const parquet = await this.duckdb.exportQueryToParquet(dto.sql);

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(parquet)], { type: 'application/octet-stream' }), `${dto.slug}.parquet`);
    form.append('sourceResourceId', dto.sourceResourceId);
    form.append('title', dto.title);
    form.append('slug', dto.slug);
    form.append('folder', dto.folder);
    if (dto.description) form.append('description', dto.description);
    if (dto.visibility) form.append('visibility', dto.visibility);
    form.append('recipe', JSON.stringify(dto.recipe));

    const base = `${apiUrl}/organizations/${dto.organizationId}/datasets/${dto.datasetId}/analyses/vizcanvas`;
    const endpoint = dto.analysisId ? `${base}/${dto.analysisId}` : base;

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: dto.analysisId ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${dto.publishToken}` },
        body: form,
      });
    } catch (err) {
      this.logger.warn(`[publishAnalysis] ${endpoint}: ${(err as Error).message}`);
      throw new BadGatewayException('No se pudo conectar con Ibero Data');
    }

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new HttpException(body, res.status);
    }
    return body;
  }

  private resolveApiUrl(raw: string): string {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BadRequestException('Invalid Ibero Data URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new BadRequestException('Invalid Ibero Data URL');
    }
    const normalized = url.toString().replace(/\/+$/, '');
    const allowed = process.env.IBERO_API_URL?.replace(/\/+$/, '');
    if (allowed && normalized !== allowed) {
      throw new BadRequestException('Ibero Data URL not allowed');
    }
    return normalized;
  }
}
