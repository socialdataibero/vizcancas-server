import { IsString, IsUrl, IsNotEmpty } from 'class-validator';

export class CkanLoginDto {
  @IsString()
  @IsNotEmpty()
  handoffToken: string;

  @IsString()
  @IsNotEmpty()
  ckanUrl: string;
}
