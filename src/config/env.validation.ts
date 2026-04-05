import {
  IsString,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsOptional,
  MinLength,
  MaxLength,
  Min,
  Max,
  ValidateIf,
  IsIn,
} from 'class-validator';
import { plainToInstance } from 'class-transformer';

/**
 * LLM provider enum — which provider is active at runtime.
 */
export enum LlmProvider {
  OPENROUTER = 'openrouter',
  DEEPINFRA = 'deepinfra',
}

/**
 * Node environment enum.
 */
export enum NodeEnv {
  DEVELOPMENT = 'development',
  STAGING = 'staging',
  PRODUCTION = 'production',
}

/**
 * Environment variable DTO for validation.
 * Fields are marked required or optional according to the actual .env spec.
 */
export class EnvironmentVariables {
  // ─── Application ───────────────────────────────────────────────────────────

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(65535)
  PORT?: number;

  @IsOptional()
  @IsEnum(NodeEnv)
  NODE_ENV?: NodeEnv;

  // ─── Database ──────────────────────────────────────────────────────────────

  @IsString()
  DATABASE_HOST!: string;

  @IsNumber()
  @Min(1)
  @Max(65535)
  DATABASE_PORT!: number;

  @IsString()
  DATABASE_NAME!: string;

  @IsString()
  DATABASE_USER!: string;

  @IsString()
  DATABASE_PASSWORD!: string;

  @IsOptional()
  @IsBoolean()
  DATABASE_SSL?: boolean;

  // ─── JWT ──────────────────────────────────────────────────────────────────

  @IsString()
  @MinLength(20, { message: 'JWT_SECRET must be at least 20 characters long' })
  JWT_SECRET!: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRES_IN?: string;

  // ─── LLM Provider ──────────────────────────────────────────────────────────

  @IsEnum(LlmProvider)
  LLM_PROVIDER!: LlmProvider;

  @ValidateIf((o) => o.LLM_PROVIDER === LlmProvider.OPENROUTER)
  @IsString()
  OPENROUTER_API_KEY?: string;

  @ValidateIf((o) => o.LLM_PROVIDER === LlmProvider.DEEPINFRA)
  @IsString()
  DEEPINFRA_API_KEY?: string;

  // ─── afrus ────────────────────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  AFRUS_API_URL?: string;

  @IsOptional()
  @IsString()
  AFRUS_API_KEY?: string;

  // ─── ALMA ─────────────────────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  ALMA_WEBHOOK_URL?: string;

  @IsOptional()
  @IsString()
  ALMA_WEBHOOK_SECRET?: string;

  // ─── Logging ───────────────────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  @IsIn(['error', 'warn', 'info', 'debug', 'verbose'])
  LOG_LEVEL?: string;
}

/**
 * Validates the environment variables and returns an array of error messages.
 * Returns an empty array if all variables are valid.
 *
 * This is called at startup in main.ts.
 */
export function validateEnvironmentVariables(): string[] {
  const errors: string[] = [];

  // Check required raw env vars (before class-transformer processing)
  const required = [
    'DATABASE_HOST',
    'DATABASE_PASSWORD',
    'JWT_SECRET',
    'LLM_PROVIDER',
  ];

  for (const key of required) {
    if (!process.env[key]) {
      errors.push(`Missing required environment variable: ${key}`);
    }
  }

  // Check JWT_SECRET length
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 20) {
    errors.push('JWT_SECRET must be at least 20 characters long');
  }

  // Check LLM provider key
  const provider = process.env.LLM_PROVIDER;
  if (provider === 'openrouter' && !process.env.OPENROUTER_API_KEY) {
    errors.push(
      'LLM_PROVIDER=openrouter but OPENROUTER_API_KEY is not set',
    );
  }
  if (provider === 'deepinfra' && !process.env.DEEPINFRA_API_KEY) {
    errors.push(
      'LLM_PROVIDER=deepinfra but DEEPINFRA_API_KEY is not set',
    );
  }

  // Check DATABASE_PORT is valid number
  const port = parseInt(process.env.DATABASE_PORT || '', 10);
  if (process.env.DATABASE_PORT && (isNaN(port) || port < 1 || port > 65535)) {
    errors.push('DATABASE_PORT must be a number between 1 and 65535');
  }

  return errors;
}
