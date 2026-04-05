import { IsString, IsOptional, IsBoolean, IsNumber, IsDateString } from 'class-validator';

export class CreateLeadDto {
  @IsString()
  email: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  contactRole?: string;

  @IsString()
  @IsOptional()
  afrusLeadId?: string;

  @IsString()
  @IsOptional()
  stage?: string;

  @IsString()
  @IsOptional()
  temperature?: string;

  @IsString()
  @IsOptional()
  campaignId?: string;

  @IsString()
  @IsOptional()
  campaignName?: string;

  @IsString()
  @IsOptional()
  widgetId?: string;

  @IsString()
  @IsOptional()
  widgetName?: string;

  @IsBoolean()
  @IsOptional()
  isImported?: boolean;

  @IsString()
  @IsOptional()
  url?: string;

  @IsString()
  @IsOptional()
  utmCampaign?: string;

  @IsNumber()
  @IsOptional()
  dealValue?: number;

  @IsDateString()
  @IsOptional()
  nextContactDate?: string;
}
