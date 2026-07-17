import { BadRequestException } from '@nestjs/common';

const ALLOWED_STARTS = new Set([
  'SELECT',
  'WITH',
  'FROM',
  'DESCRIBE',
  'SUMMARIZE',
  'SHOW',
  'EXPLAIN',
]);

export function assertReadOnlySql(sql: string): void {
  const stripped = sql
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');

  const body = stripped.replace(/;\s*$/, '');
  if (body.includes(';')) {
    throw new BadRequestException('Only one SQL statement is allowed per query');
  }

  const first = body
    .trim()
    .replace(/^\(+\s*/, '')
    .match(/^[a-zA-Z]+/)?.[0]
    ?.toUpperCase();

  if (!first || !ALLOWED_STARTS.has(first)) {
    throw new BadRequestException('Only read-only queries (SELECT/WITH) are allowed');
  }
}
