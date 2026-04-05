import { IsString, IsOptional, IsObject } from 'class-validator';

export class TransitionLeadDto {
  @IsString()
  toStage!: string;

  @IsOptional()
  @IsString()
  lostReasonId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
