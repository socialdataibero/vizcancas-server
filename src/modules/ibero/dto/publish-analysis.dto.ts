import { IsIn, IsObject, IsOptional, IsString, IsUUID, Matches, MinLength } from 'class-validator';

export class PublishAnalysisDto {
  @IsString()
  @MinLength(1)
  sql: string;

  @IsString()
  apiUrl: string;

  @IsString()
  publishToken: string;

  @IsUUID()
  organizationId: string;

  @IsUUID()
  datasetId: string;

  @IsOptional()
  @IsUUID()
  analysisId?: string;

  @IsUUID()
  sourceResourceId: string;

  @IsString()
  @MinLength(2)
  title: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'slug can only contain lowercase letters, numbers and hyphens' })
  slug: string;

  @IsString()
  @MinLength(1)
  folder: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['PUBLIC', 'PRIVATE'])
  visibility?: 'PUBLIC' | 'PRIVATE';

  @IsObject()
  recipe: Record<string, unknown>;
}
