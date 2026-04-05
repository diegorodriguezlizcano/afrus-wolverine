import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import {
  LlmProvider,
  NodeEnv,
} from './env.validation.js';

// Re-export for convenience (tests and other modules can import from here)
export { LlmProvider, NodeEnv } from './env.validation.js';

/**
 * Application-wide typed configuration access.
 *
 * All environment variables MUST be accessed through this service.
 * No direct `process.env` access in business logic — go through getters.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: NestConfigService) {}

  // ─── Database ────────────────────────────────────────────────────────────

  getDatabaseHost(): string {
    return this.config.get<string>('DATABASE_HOST', 'localhost');
  }

  getDatabasePort(): number {
    const val = this.config.get<string>('DATABASE_PORT');
    return val ? parseInt(val, 10) : 5432;
  }

  getDatabaseName(): string {
    return this.config.get<string>('DATABASE_NAME', 'wolverine');
  }

  getDatabaseUser(): string {
    return this.config.get<string>('DATABASE_USER', 'wolverine');
  }

  getDatabasePassword(): string {
    return this.config.get<string>('DATABASE_PASSWORD', '');
  }

  getDatabaseSsl(): boolean {
    const val = this.config.get<string>('DATABASE_SSL');
    return val === 'true' || val === '1';
  }

  /**
   * Builds a PostgreSQL connection URL from the individual components.
   * Used by PrismaService to connect to the database.
   */
  getDatabaseUrl(): string {
    const host = this.getDatabaseHost();
    const port = this.getDatabasePort();
    const name = this.getDatabaseName();
    const user = this.getDatabaseUser();
    const password = this.getDatabasePassword();
    const ssl = this.getDatabaseSsl() ? '?sslmode=require' : '?sslmode=disable';

    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(
      password,
    )}@${host}:${port}/${name}${ssl}`;
  }

  // ─── LLM Provider ────────────────────────────────────────────────────────

  getLlmProvider(): LlmProvider {
    return this.config.get<LlmProvider>('LLM_PROVIDER', LlmProvider.OPENROUTER);
  }

  getOpenRouterApiKey(): string | null {
    return this.config.get<string>('OPENROUTER_API_KEY') ?? null;
  }

  getDeepInfraApiKey(): string | null {
    return this.config.get<string>('DEEPINFRA_API_KEY') ?? null;
  }

  /**
   * Returns the API key for the currently configured LLM provider.
   * @throws Error if no key is configured for the active provider
   */
  getLlmApiKey(): string {
    const provider = this.getLlmProvider();

    if (provider === LlmProvider.OPENROUTER) {
      const key = this.getOpenRouterApiKey();
      if (!key) {
        throw new Error(
          'LLM_PROVIDER=openrouter but OPENROUTER_API_KEY is not set',
        );
      }
      return key;
    }

    if (provider === LlmProvider.DEEPINFRA) {
      const key = this.getDeepInfraApiKey();
      if (!key) {
        throw new Error(
          'LLM_PROVIDER=deepinfra but DEEPINFRA_API_KEY is not set',
        );
      }
      return key;
    }

    throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
  }

  // ─── afrus ─────────────────────────────────────────────────────────────

  getAfrusApiUrl(): string {
    return this.config.get<string>(
      'AFRUS_API_URL',
      'https://backend.afrus.app',
    );
  }

  /**
   * Per-org afrus API keys are stored in the database.
   * This env var is only for the initial setup / onboarding fallback.
   */
  getAfrusApiKey(): string | null {
    return this.config.get<string>('AFRUS_API_KEY') ?? null;
  }

  // ─── ALMA ────────────────────────────────────────────────────────────────

  /**
   * @deprecated ALMA communication is handled by afrus directly.
   * Set ALMA_ENABLED=true only when ready to integrate.
   */
  isAlmaEnabled(): boolean {
    return this.config.get<boolean>('ALMA_ENABLED') === true;
  }

  getAlmaWebhookUrl(): string {
    return this.config.get<string>(
      'ALMA_WEBHOOK_URL',
      'https://backend.afrus.app/api/v1/alma/webhook',
    );
  }

  getAlmaWebhookSecret(): string | null {
    return this.config.get<string>('ALMA_WEBHOOK_SECRET') ?? null;
  }

  // ─── JWT ────────────────────────────────────────────────────────────────

  getJwtSecret(): string {
    return this.config.get<string>('JWT_SECRET', '');
  }

  getJwtExpiresIn(): string {
    return this.config.get<string>('JWT_EXPIRES_IN', '7d');
  }

  // ─── Application ────────────────────────────────────────────────────────

  getPort(): number {
    const val = this.config.get<string>('PORT');
    return val ? parseInt(val, 10) : 3000;
  }

  getNodeEnv(): string {
    return this.config.get<string>('NODE_ENV', 'development');
  }

  isProduction(): boolean {
    return this.getNodeEnv() === 'production';
  }

  getLogLevel(): string {
    return this.config.get<string>('LOG_LEVEL', 'info');
  }
}
