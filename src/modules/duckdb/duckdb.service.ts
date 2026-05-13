import { BadRequestException, Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import * as duckdb from 'duckdb';
import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';
import { feature as topoFeature } from 'topojson-client';

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  role?: 'geometry' | 'latitude' | 'longitude' | 'join_key';
}

function isNumericType(type: string): boolean {
  return /int|decimal|double|float|real|numeric|number|hugeint|bigint|smallint|tinyint|uinteger|ubigint|usmallint|utinyint/i.test(type);
}

function normalizeIdText(value: string): string {
  return value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function canonicalizeToken(token: string): string {
  if (/^(lat|latitude)$/.test(token)) return 'lat';
  if (/^(lon|lng|long|longitude)$/.test(token)) return 'lon';
  return token;
}

function tokenizeIdentifier(name: string): string[] {
  return normalizeIdText(name).split(/\s+/).filter(Boolean).map(canonicalizeToken);
}

export function inferColumnRole(name: string, type: string): ColumnInfo['role'] | undefined {
  const normalizedName = normalizeIdText(name);
  const tokens = tokenizeIdentifier(name);

  if (/(^| )(geometry|geom|geojson|topojson|shape)( |$)/.test(normalizedName)) return 'geometry';
  if (isNumericType(type) && tokens.includes('lat')) return 'latitude';
  if (isNumericType(type) && tokens.includes('lon')) return 'longitude';
  if (tokens.includes('name') || tokens.includes('code') || tokens.includes('cve') || tokens.includes('cod') || /(^| )(id|key)( |$)/.test(normalizedName)) return 'join_key';
  return undefined;
}

export interface QueryResult {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  totalRows: number;
  sql: string;
}

export interface TableMeta {
  fileSize?: number;
  fileType?: string;
  originalName?: string;
}

@Injectable()
export class DuckdbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DuckdbService.name);
  private db: duckdb.Database;
  private conn: duckdb.Connection;

  private readonly dataDir = path.join(process.cwd(), 'data');
  private readonly dbPath = path.join(process.cwd(), 'data', 'vizcanvas.db');
  private readonly metaPath = path.join(process.cwd(), 'data', 'meta.json');
  private tableMeta = new Map<string, TableMeta>();

  onModuleInit(): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.db = new duckdb.Database(this.dbPath);
    this.conn = this.db.connect();
    this.tableMeta = this.loadMeta();
    this.logger.log(`DuckDB inicializado con persistencia en ${this.dbPath}`);
  }

  onModuleDestroy(): void {
    this.conn?.close();
    this.db?.close();
  }

  private loadMeta(): Map<string, TableMeta> {
    try {
      const raw = fs.readFileSync(this.metaPath, 'utf-8');
      return new Map(Object.entries(JSON.parse(raw) as Record<string, TableMeta>));
    } catch {
      return new Map();
    }
  }

  private saveMeta(): void {
    fs.writeFileSync(
      this.metaPath,
      JSON.stringify(Object.fromEntries(this.tableMeta), null, 2),
    );
  }

  private runAsync(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.conn.run(sql, (err) =>
        err ? reject(new BadRequestException(err.message)) : resolve(),
      );
    });
  }

  private allAsync(sql: string): Promise<Record<string, unknown>[]> {
    return new Promise((resolve, reject) => {
      this.conn.all(sql, (err, rows) =>
        err
          ? reject(new BadRequestException(err.message))
          : resolve((rows ?? []) as Record<string, unknown>[]),
      );
    });
  }

  private convertRow(row: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(row).map(([k, v]) => [k, this.convertValue(v)]),
    );
  }

  private convertValue(val: unknown): unknown {
    if (val === null || val === undefined) return null;
    if (typeof val === 'bigint') return Number(val);
    return val;
  }

  private async describeQuery(sql: string): Promise<ColumnInfo[]> {
    try {
      const rows = await this.allAsync(`DESCRIBE (${sql})`);
      return rows.map((r) => {
        const name = String(r['column_name']);
        const type = String(r['column_type']);
        const col: ColumnInfo = { name, type, nullable: r['null'] !== 'NO' };
        const role = inferColumnRole(name, type);
        if (role) col.role = role;
        return col;
      });
    } catch {
      return [];
    }
  }

  private async describeTable(tableName: string): Promise<ColumnInfo[]> {
    const safe = tableName.replace(/"/g, '""');
    const rows = await this.allAsync(`DESCRIBE "${safe}"`);
    return rows.map((r) => {
      const name = String(r['column_name']);
      const type = String(r['column_type']);
      const col: ColumnInfo = { name, type, nullable: r['null'] !== 'NO' };
      const role = inferColumnRole(name, type);
      if (role) col.role = role;
      return col;
    });
  }

  async executeQuery(sql: string): Promise<QueryResult> {
    const [columns, rawRows] = await Promise.all([
      this.describeQuery(sql),
      this.allAsync(sql),
    ]);
    const rows = rawRows.map((r) => this.convertRow(r));
    const finalColumns = columns.length
      ? columns
      : this.inferColumns(rows);
    return { columns: finalColumns, rows, totalRows: rows.length, sql };
  }

  async executeQueryLimited(sql: string, limit = 250): Promise<QueryResult> {
    const limitedSql = `SELECT * FROM (${sql}) AS _q LIMIT ${limit}`;
    const countSql = `SELECT COUNT(*) AS total FROM (${sql}) AS _q`;

    const [columns, rawRows, countRows] = await Promise.all([
      this.describeQuery(sql),
      this.allAsync(limitedSql),
      this.allAsync(countSql).catch(() => [{ total: 0 }]),
    ]);

    const rows = rawRows.map((r) => this.convertRow(r));
    const finalColumns = columns.length ? columns : this.inferColumns(rows);
    const totalRows = Number(countRows[0]?.['total'] ?? rows.length);

    return { columns: finalColumns, rows, totalRows, sql };
  }

  private inferColumns(rows: Record<string, unknown>[]): ColumnInfo[] {
    if (!rows.length) return [];
    return Object.keys(rows[0]).map((name) => {
      const sample = rows.find((r) => r[name] !== null)?.[name];
      return { name, type: this.inferType(sample), nullable: true };
    });
  }

  private inferType(val: unknown): string {
    if (val instanceof Date) return 'TIMESTAMP';
    if (typeof val === 'boolean') return 'BOOLEAN';
    if (typeof val === 'bigint') return 'BIGINT';
    if (typeof val === 'number') return Number.isInteger(val) ? 'INTEGER' : 'DOUBLE';
    return 'VARCHAR';
  }

  async getTableSchema(tableName: string): Promise<ColumnInfo[]> {
    return this.describeTable(tableName);
  }

  async getTables(): Promise<string[]> {
    const rows = await this.allAsync(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name",
    );
    return rows.map((r) => String(r['table_name']));
  }

  async getTablesWithMeta(): Promise<
    Array<{ name: string; columns: ColumnInfo[]; rowCount: number; fileSize?: number; fileType?: string }>
  > {
    const names = await this.getTables();
    return Promise.all(
      names.map(async (name) => {
        const safe = name.replace(/"/g, '""');
        const [columns, countRows] = await Promise.all([
          this.describeTable(name),
          this.allAsync(`SELECT COUNT(*) AS cnt FROM "${safe}"`),
        ]);
        const meta = this.tableMeta.get(name) ?? {};
        return {
          name,
          columns,
          rowCount: Number(countRows[0]?.['cnt'] ?? 0),
          fileSize: meta.fileSize,
          fileType: meta.fileType,
        };
      }),
    );
  }

  async resolveTableName(baseName: string): Promise<string> {
    const existing = await this.getTables();
    let name = baseName;
    let suffix = 1;
    while (existing.includes(name)) {
      name = `${baseName}_${suffix}`;
      suffix++;
    }
    return name;
  }

  async loadFileFromDisk(
    filePath: string,
    tableName: string,
    ext: string,
    meta?: TableMeta,
  ): Promise<{ columns: ColumnInfo[]; rowCount: number }> {
    if (ext === 'geojson' || ext === 'topojson') {
      return this.loadGeoFile(filePath, tableName, ext, meta);
    }

    const safe = tableName.replace(/"/g, '""');
    const safePath = filePath.replace(/\\/g, '/').replace(/'/g, "''");
    let sql: string;

    switch (ext) {
      case 'csv':
      case 'tsv':
        sql = `CREATE OR REPLACE TABLE "${safe}" AS SELECT * FROM read_csv('${safePath}', auto_detect=true, header=true)`;
        break;
      case 'parquet':
        sql = `CREATE OR REPLACE TABLE "${safe}" AS SELECT * FROM read_parquet('${safePath}')`;
        break;
      case 'json':
      case 'jsonl':
        sql = `CREATE OR REPLACE TABLE "${safe}" AS SELECT * FROM read_json('${safePath}', auto_detect=true)`;
        break;
      default:
        throw new Error(`Tipo de archivo no soportado: .${ext}`);
    }

    await this.runAsync(sql);

    const [columns, countRows] = await Promise.all([
      this.describeTable(tableName),
      this.allAsync(`SELECT COUNT(*) AS cnt FROM "${safe}"`),
    ]);

    if (meta) { this.tableMeta.set(tableName, meta); this.saveMeta(); }

    return { columns, rowCount: Number(countRows[0]?.['cnt'] ?? 0) };
  }

  private async loadGeoFile(
    filePath: string,
    tableName: string,
    ext: string,
    meta?: TableMeta,
  ): Promise<{ columns: ColumnInfo[]; rowCount: number }> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    const { rows, columns } = normalizeGeoData(parsed, ext);
    return this.importTableData(tableName, rows, columns, meta);
  }

  async dropTable(tableName: string): Promise<void> {
    const safe = tableName.replace(/"/g, '""');
    await this.runAsync(`DROP TABLE IF EXISTS "${safe}"`);
    this.tableMeta.delete(tableName);
    this.saveMeta();
  }

  async clearAllTables(): Promise<void> {
    const names = await this.getTables();
    for (const name of names) {
      await this.dropTable(name);
    }
  }

  // Tables above this threshold are exported as schema-only to avoid JSON serialization limits.
  private static readonly INLINE_ROW_LIMIT = 100_000;

  async exportTableData(tableName: string): Promise<{
    columns: ColumnInfo[];
    rows: Record<string, unknown>[];
    rowCount: number;
    dataEmbedded: boolean;
  }> {
    const safe = tableName.replace(/"/g, '""');
    const [columns, countRows] = await Promise.all([
      this.describeTable(tableName),
      this.allAsync(`SELECT COUNT(*) AS cnt FROM "${safe}"`),
    ]);
    const total = Number(countRows[0]?.['cnt'] ?? 0);

    if (total > DuckdbService.INLINE_ROW_LIMIT) {
      this.logger.warn(`exportTableData: "${tableName}" has ${total} rows — skipping inline embed`);
      return { columns, rows: [], rowCount: total, dataEmbedded: false };
    }

    const tmpPath = path.join(process.cwd(), 'uploads', `__export_${Date.now()}.ndjson`);
    const safeTmp = tmpPath.replace(/\\/g, '/').replace(/'/g, "''");
    try {
      await this.runAsync(`COPY "${safe}" TO '${safeTmp}' (FORMAT JSON)`);
      const rows: Record<string, unknown>[] = [];
      const rl = readline.createInterface({ input: fs.createReadStream(tmpPath), crlfDelay: Infinity });
      for await (const line of rl) {
        if (line.trim()) rows.push(this.convertRow(JSON.parse(line) as Record<string, unknown>));
      }
      return { columns, rows, rowCount: rows.length, dataEmbedded: true };
    } finally {
      try { fs.unlinkSync(tmpPath); } catch { /* already deleted */ }
    }
  }

  async importTableData(
    tableName: string,
    rows: Record<string, unknown>[],
    columns: ColumnInfo[],
    meta?: TableMeta,
  ): Promise<{ columns: ColumnInfo[]; rowCount: number }> {
    const safe = tableName.replace(/"/g, '""');
    await this.runAsync(`DROP TABLE IF EXISTS "${safe}"`);

    if (rows.length === 0) {
      const colDefs = columns
        .map((c) => `"${c.name.replace(/"/g, '""')}" ${normalizeDuckDBType(c.type)}`)
        .join(', ');
      await this.runAsync(`CREATE TABLE "${safe}" (${colDefs})`);
    } else {
      const tmpPath = path.join(process.cwd(), 'uploads', `__tmp_${Date.now()}.json`);
      fs.writeFileSync(tmpPath, JSON.stringify(rows));
      try {
        const safeTmp = tmpPath.replace(/\\/g, '/').replace(/'/g, "''");
        await this.runAsync(
          `CREATE OR REPLACE TABLE "${safe}" AS SELECT * FROM read_json('${safeTmp}', auto_detect=true)`,
        );
      } finally {
        fs.unlinkSync(tmpPath);
      }
    }

    const [schema, countRows] = await Promise.all([
      this.describeTable(tableName),
      this.allAsync(`SELECT COUNT(*) AS cnt FROM "${safe}"`),
    ]);

    if (meta) { this.tableMeta.set(tableName, meta); this.saveMeta(); }

    return { columns: schema, rowCount: Number(countRows[0]?.['cnt'] ?? 0) };
  }
}

// ─── Helpers (module-level) ──────────────────────────────────────────────────

function normalizeDuckDBType(type: string): string {
  const t = (type ?? '').trim().toUpperCase();
  if (/^DATE/.test(t)) return 'DATE';
  if (/^TIMESTAMP/.test(t)) return 'TIMESTAMP';
  if (/^(VARCHAR|TEXT|STRING|UUID)/.test(t)) return 'VARCHAR';
  if (/^BOOL/.test(t)) return 'BOOLEAN';
  if (/^(FLOAT64|DOUBLE|REAL)/.test(t)) return 'DOUBLE';
  if (/^FLOAT/.test(t)) return 'FLOAT';
  if (/^(INT64|BIGINT|HUGEINT)/.test(t)) return 'BIGINT';
  if (/^(INT32|INTEGER|INT)/.test(t)) return 'INTEGER';
  if (/^(INT16|SMALLINT)/.test(t)) return 'SMALLINT';
  if (/^(INT8|TINYINT)/.test(t)) return 'TINYINT';
  if (/^(UINT64|UBIGINT)/.test(t)) return 'UBIGINT';
  if (/^(UINT32|UINTEGER)/.test(t)) return 'UINTEGER';
  if (/^(DECIMAL|NUMERIC)/.test(t)) return type.toUpperCase();
  if (/^(JSON|STRUCT|MAP|LIST|ARRAY)/.test(t)) return 'JSON';
  if (/^(BLOB|BINARY)/.test(t)) return 'BLOB';
  return 'VARCHAR';
}

type GeoFeature = {
  type?: string;
  id?: unknown;
  properties?: Record<string, unknown> | null;
  geometry?: unknown;
};

function normalizeGeoData(
  parsed: unknown,
  ext: string,
): { rows: Record<string, unknown>[]; columns: ColumnInfo[] } {
  let features: GeoFeature[] = [];
  const obj = parsed as Record<string, unknown>;

  if (ext === 'topojson' && obj?.type === 'Topology') {
    const objects = (obj.objects ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(objects)) {
      try {
        const geojson = topoFeature(parsed as Parameters<typeof topoFeature>[0], objects[key] as Parameters<typeof topoFeature>[1]);
        const fc = geojson as { type: string; features?: GeoFeature[] };
        if (fc.type === 'FeatureCollection' && Array.isArray(fc.features)) {
          features = features.concat(fc.features as GeoFeature[]);
        } else {
          features.push(fc as GeoFeature);
        }
      } catch {
        // skip invalid objects
      }
    }
  } else if (obj?.type === 'FeatureCollection' && Array.isArray(obj.features)) {
    features = obj.features as GeoFeature[];
  } else if (obj?.type === 'Feature') {
    features = [obj as GeoFeature];
  }

  if (!features.length) return { rows: [], columns: [] };

  const rows = features.map((f) => ({
    ...(f.properties ?? {}),
    geometry: f.geometry ? JSON.stringify(f.geometry) : null,
  }));

  const firstRow = rows[0] ?? {};
  const columns: ColumnInfo[] = Object.keys(firstRow).map((name) => ({
    name,
    type: name === 'geometry' ? 'VARCHAR' : inferJsType(firstRow[name]),
    nullable: true,
  }));

  return { rows, columns };
}

function inferJsType(val: unknown): string {
  if (typeof val === 'number') return Number.isInteger(val) ? 'INTEGER' : 'DOUBLE';
  if (typeof val === 'boolean') return 'BOOLEAN';
  return 'VARCHAR';
}
