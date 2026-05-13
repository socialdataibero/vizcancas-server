import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface FileInfo {
  originalName: string;
  filename: string;
  size: number;
  mimetype: string;
  uploadedAt: string;
}

@Injectable()
export class FilesService {
  readonly uploadsDir = path.join(process.cwd(), 'uploads');

  listFiles(): FileInfo[] {
    if (!fs.existsSync(this.uploadsDir)) return [];

    return fs
      .readdirSync(this.uploadsDir)
      .filter((name) => !name.startsWith('.'))
      .map((filename) => {
        const filePath = path.join(this.uploadsDir, filename);
        const stat = fs.statSync(filePath);
        return {
          originalName: filename,
          filename,
          size: stat.size,
          mimetype: this.getMimetype(filename),
          uploadedAt: stat.mtime.toISOString(),
        };
      });
  }

  deleteFile(filename: string): boolean {
    const filePath = path.join(this.uploadsDir, path.basename(filename));
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  }

  private getMimetype(filename: string): string {
    const map: Record<string, string> = {
      '.csv': 'text/csv',
      '.tsv': 'text/tab-separated-values',
      '.json': 'application/json',
      '.jsonl': 'application/jsonlines',
      '.parquet': 'application/octet-stream',
      '.geojson': 'application/geo+json',
      '.topojson': 'application/json',
    };
    return map[path.extname(filename).toLowerCase()] ?? 'application/octet-stream';
  }
}
