import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { FilesService } from './files.service';
import { DuckdbService } from '../duckdb/duckdb.service';

const ALLOWED_EXTENSIONS = new Set([
  '.csv', '.tsv', '.json', '.jsonl', '.parquet', '.geojson', '.topojson',
]);

function buildStorage(uploadsDir: string) {
  return diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(uploadsDir, { recursive: true });
      cb(null, uploadsDir);
    },
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, safe);
    },
  });
}

function extensionFilter(
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, accept: boolean) => void,
) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(new BadRequestException(`Tipo de archivo no soportado: ${ext}`), false);
  }
  cb(null, true);
}

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

@Controller('files')
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly duckdb: DuckdbService,
  ) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: buildStorage(UPLOADS_DIR),
      fileFilter: extensionFilter,
    }),
  )
  async uploadOne(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');

    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    const baseName = path.basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase() || 'uploaded_data';

    const tableName = await this.duckdb.resolveTableName(baseName);

    const { columns, rowCount } = await this.duckdb.loadFileFromDisk(
      file.path,
      tableName,
      ext,
      { fileSize: file.size, fileType: ext, originalName: file.originalname },
    );

    return {
      originalName: file.originalname,
      filename: file.filename,
      tableName,
      columns,
      rowCount,
      size: file.size,
      mimetype: file.mimetype,
      uploadedAt: new Date().toISOString(),
    };
  }

  @Post('upload-many')
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      storage: buildStorage(UPLOADS_DIR),
      fileFilter: extensionFilter,
    }),
  )
  async uploadMany(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException('No se recibieron archivos');

    return Promise.all(
      files.map(async (file) => {
        const ext = path.extname(file.originalname).toLowerCase().slice(1);
        const baseName = path.basename(file.originalname, path.extname(file.originalname))
          .replace(/[^a-zA-Z0-9_]/g, '_')
          .replace(/^_+|_+$/g, '')
          .toLowerCase() || 'uploaded_data';

        const tableName = await this.duckdb.resolveTableName(baseName);

        const { columns, rowCount } = await this.duckdb.loadFileFromDisk(
          file.path,
          tableName,
          ext,
          { fileSize: file.size, fileType: ext, originalName: file.originalname },
        );

        return {
          originalName: file.originalname,
          filename: file.filename,
          tableName,
          columns,
          rowCount,
          size: file.size,
          mimetype: file.mimetype,
          uploadedAt: new Date().toISOString(),
        };
      }),
    );
  }

  @Get()
  listFiles() {
    return this.filesService.listFiles();
  }

  @Delete(':filename')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteFile(@Param('filename') filename: string) {
    if (!this.filesService.deleteFile(filename)) {
      throw new NotFoundException(`Archivo no encontrado: ${filename}`);
    }
  }
}
