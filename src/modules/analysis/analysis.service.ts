import { Injectable } from '@nestjs/common';
import { DuckdbService, ColumnInfo, inferColumnRole } from '../duckdb/duckdb.service';

export interface JoinSuggestion {
  leftColumn: string;
  rightColumn: string;
  score: number;
  sharedValueCount: number;
  sampleCoverage: number;
  reason: string;
}

export interface SuggestedMapFlow {
  geoTableName: string;
  dataTableName: string;
  join: JoinSuggestion;
}

@Injectable()
export class AnalysisService {
  constructor(private readonly duckdb: DuckdbService) {}

  async getMapFlows(tableName?: string): Promise<SuggestedMapFlow[]> {
    const allTables = await this.duckdb.getTablesWithMeta();

    const geoTables = allTables.filter((t) => t.columns.some((c) => (c.role ?? inferColumnRole(c.name, c.type)) === 'geometry'));
    const dataTables = allTables.filter((t) => !t.columns.some((c) => (c.role ?? inferColumnRole(c.name, c.type)) === 'geometry'));

    const candidateGeoTables = tableName ? geoTables.filter((t) => t.name === tableName) : geoTables;
    const candidateDataTables = tableName ? dataTables.filter((t) => t.name === tableName) : dataTables;

    const flows: SuggestedMapFlow[] = [];

    if (candidateGeoTables.length > 0) {
      for (const geoTable of candidateGeoTables) {
        for (const dataTable of dataTables.filter((t) => t.name !== geoTable.name)) {
          const join = await this.getBestJoin(geoTable.name, geoTable.columns, dataTable.name, dataTable.columns);
          if (join) flows.push({ geoTableName: geoTable.name, dataTableName: dataTable.name, join });
        }
      }
    } else if (candidateDataTables.length > 0) {
      for (const dataTable of candidateDataTables) {
        for (const geoTable of geoTables.filter((t) => t.name !== dataTable.name)) {
          const join = await this.getBestJoin(geoTable.name, geoTable.columns, dataTable.name, dataTable.columns);
          if (join) flows.push({ geoTableName: geoTable.name, dataTableName: dataTable.name, join });
        }
      }
    }

    return flows.sort((a, b) => b.join.score - a.join.score);
  }

  private async getBestJoin(
    leftTable: string, leftCols: ColumnInfo[],
    rightTable: string, rightCols: ColumnInfo[],
  ): Promise<JoinSuggestion | null> {
    const leftCandidates = leftCols.filter((c) => this.isJoinCandidate(c));
    const rightCandidates = rightCols.filter((c) => this.isJoinCandidate(c));

    const pairs = leftCandidates.flatMap((l) => rightCandidates.map((r) => ({ l, r })));
    const scored = await Promise.all(
      pairs.map(async ({ l, r }) => {
        const nameScore = this.scoreNames(l, r);
        if (nameScore < 5) return null;

        const [lv, rv] = await Promise.all([
          this.sampleValues(leftTable, l.name),
          this.sampleValues(rightTable, r.name),
        ]);

        const shared = Array.from(lv).filter((v) => rv.has(v)).length;
        const coverage = lv.size > 0 && rv.size > 0 ? shared / Math.min(lv.size, rv.size) : 0;
        const score = nameScore + coverage * 70;
        if (score < 12) return null;

        return {
          leftColumn: l.name,
          rightColumn: r.name,
          score,
          sharedValueCount: shared,
          sampleCoverage: coverage,
          reason: this.buildReason(shared, coverage, nameScore),
        } satisfies JoinSuggestion;
      }),
    );

    const valid = scored.filter((s): s is JoinSuggestion => s !== null);
    valid.sort((a, b) => b.score - a.score || b.sharedValueCount - a.sharedValueCount);
    return valid[0] ?? null;
  }

  private async sampleValues(tableName: string, columnName: string): Promise<Set<string>> {
    try {
      const safe = tableName.replace(/"/g, '""');
      const safeCol = columnName.replace(/"/g, '""');
      const result = await this.duckdb.executeQueryLimited(
        `SELECT DISTINCT "${safeCol}" FROM "${safe}" WHERE "${safeCol}" IS NOT NULL`,
        250,
      );
      const out = new Set<string>();
      for (const row of result.rows) {
        const v = this.normalizeValue(row[columnName]);
        if (v) out.add(v);
      }
      return out;
    } catch {
      return new Set();
    }
  }

  private normalizeValue(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const s = String(value).trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '');
    if (!s) return null;
    return /^\d+$/.test(s) ? (s.replace(/^0+/, '') || '0') : s;
  }

  private isJoinCandidate(col: ColumnInfo): boolean {
    const role = col.role ?? inferColumnRole(col.name, col.type);
    return role !== 'geometry' && role !== 'latitude' && role !== 'longitude';
  }

  private scoreNames(left: ColumnInfo, right: ColumnInfo): number {
    const ln = this.normId(left.name);
    const rn = this.normId(right.name);
    if (ln === rn && ln) return 35;
    if (ln && rn && (ln.includes(rn) || rn.includes(ln))) return 20;

    const lt = this.tokens(left.name);
    const rt = this.tokens(right.name);
    const shared = lt.filter((t) => rt.includes(t));
    let score = shared.length * 8;
    if (lt.includes('name') && rt.includes('name')) score += 8;
    if (lt.includes('code') && rt.includes('code')) score += 5;
    if ((left.role ?? inferColumnRole(left.name, left.type)) === 'join_key' &&
        (right.role ?? inferColumnRole(right.name, right.type)) === 'join_key') score += 6;
    return score;
  }

  private buildReason(shared: number, coverage: number, nameScore: number): string {
    if (shared > 0) return `${shared} shared sample values · ${Math.round(coverage * 100)}% overlap`;
    if (nameScore >= 35) return 'matching column names';
    if (nameScore >= 16) return 'similar key columns';
    return 'possible join keys';
  }

  private normId(name: string): string {
    return name.trim().toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
      .replace(/\s+/g, '');
  }

  private tokens(name: string): string[] {
    return name.trim().toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
      .split(/\s+/).filter(Boolean)
      .map((t) => {
        if (/^(nom|nombre|name|label)$/.test(t)) return 'name';
        if (/^(cve|code|codigo|clave|key|id|iso|fips|abbr)$/.test(t)) return 'code';
        if (/^(lat|latitude)$/.test(t)) return 'lat';
        if (/^(lon|lng|long|longitude)$/.test(t)) return 'lon';
        return t;
      });
  }
}
