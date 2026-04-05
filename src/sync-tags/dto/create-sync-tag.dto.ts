import { IsString, IsOptional, MaxLength, MinLength } from 'class-validator';

export class CreateSyncTagDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  tagValue!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  afrusTagName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateSyncTagDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  tagValue?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  afrusTagName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  isActive?: boolean;
}
