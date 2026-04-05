import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppConfigService } from './config.service';
import { LlmProvider } from './env.validation.js';

describe('AppConfigService', () => {
  let service: AppConfigService;

  const makeService = (env: Record<string, string | undefined> = {}) => {
    const mockConfigService = {
      get: jest.fn(
        (key: string, defaultValue?: unknown) =>
          env[key] ?? defaultValue ?? undefined,
      ),
    } as unknown as ConfigService;

    service = new AppConfigService(mockConfigService);
    return service;
  };

  // ─── Database ─────────────────────────────────────────────────────────────

  describe('Database getters', () => {
    it('getDatabaseHost returns host from env', () => {
      makeService({ DATABASE_HOST: 'db.example.com' });
      expect(service.getDatabaseHost()).toBe('db.example.com');
    });

    it('getDatabaseHost defaults to localhost', () => {
      makeService({});
      expect(service.getDatabaseHost()).toBe('localhost');
    });

    it('getDatabasePort returns port from env', () => {
      makeService({ DATABASE_PORT: '5433' });
      expect(service.getDatabasePort()).toBe(5433);
    });

    it('getDatabasePort defaults to 5432', () => {
      makeService({});
      expect(service.getDatabasePort()).toBe(5432);
    });

    it('getDatabaseName returns name from env', () => {
      makeService({ DATABASE_NAME: 'prod_db' });
      expect(service.getDatabaseName()).toBe('prod_db');
    });

    it('getDatabaseSsl returns true when set', () => {
      makeService({ DATABASE_SSL: 'true' });
      expect(service.getDatabaseSsl()).toBe(true);
    });

    it('getDatabaseSsl defaults to false', () => {
      makeService({});
      expect(service.getDatabaseSsl()).toBe(false);
    });
  });

  describe('getDatabaseUrl', () => {
    it('formats postgres URL with all components', () => {
      makeService({
        DATABASE_HOST: 'db.example.com',
        DATABASE_PORT: '5433',
        DATABASE_NAME: 'mydb',
        DATABASE_USER: 'admin',
        DATABASE_PASSWORD: 's3cr3t',
        DATABASE_SSL: 'false',
      });
      expect(service.getDatabaseUrl()).toBe(
        'postgresql://admin:s3cr3t@db.example.com:5433/mydb?sslmode=disable',
      );
    });

    it('appends sslmode=require when DATABASE_SSL=true', () => {
      makeService({
        DATABASE_HOST: 'db.example.com',
        DATABASE_PORT: '5433',
        DATABASE_NAME: 'mydb',
        DATABASE_USER: 'admin',
        DATABASE_PASSWORD: 's3cr3t',
        DATABASE_SSL: 'true',
      });
      expect(service.getDatabaseUrl()).toBe(
        'postgresql://admin:s3cr3t@db.example.com:5433/mydb?sslmode=require',
      );
    });

    it('URL-encodes special characters in password', () => {
      makeService({
        DATABASE_HOST: 'localhost',
        DATABASE_PORT: '5432',
        DATABASE_NAME: 'mydb',
        DATABASE_USER: 'user',
        DATABASE_PASSWORD: 'pass@word',
        DATABASE_SSL: 'false',
      });
      expect(service.getDatabaseUrl()).toBe(
        'postgresql://user:pass%40word@localhost:5432/mydb?sslmode=disable',
      );
    });
  });

  // ─── LLM ─────────────────────────────────────────────────────────────────

  describe('getLlmProvider', () => {
    it('returns OPENROUTER when set', () => {
      makeService({ LLM_PROVIDER: 'openrouter' });
      expect(service.getLlmProvider()).toBe('openrouter');
    });

    it('returns DEEPINFRA when set', () => {
      makeService({ LLM_PROVIDER: 'deepinfra' });
      expect(service.getLlmProvider()).toBe('deepinfra');
    });

    it('defaults to OPENROUTER', () => {
      makeService({});
      expect(service.getLlmProvider()).toBe('openrouter');
    });
  });

  describe('getLlmApiKey', () => {
    it('returns openrouter key when LLM_PROVIDER=openrouter', () => {
      makeService({
        LLM_PROVIDER: 'openrouter',
        OPENROUTER_API_KEY: 'sk-or-key-123',
      });
      expect(service.getLlmApiKey()).toBe('sk-or-key-123');
    });

    it('returns deepinfra key when LLM_PROVIDER=deepinfra', () => {
      makeService({
        LLM_PROVIDER: 'deepinfra',
        DEEPINFRA_API_KEY: 'deepinfra-key-456',
      });
      expect(service.getLlmApiKey()).toBe('deepinfra-key-456');
    });

    it('throws if openrouter key missing', () => {
      makeService({ LLM_PROVIDER: 'openrouter', OPENROUTER_API_KEY: '' });
      expect(() => service.getLlmApiKey()).toThrow(
        'LLM_PROVIDER=openrouter but OPENROUTER_API_KEY is not set',
      );
    });

    it('throws if deepinfra key missing', () => {
      makeService({ LLM_PROVIDER: 'deepinfra', DEEPINFRA_API_KEY: '' });
      expect(() => service.getLlmApiKey()).toThrow(
        'LLM_PROVIDER=deepinfra but DEEPINFRA_API_KEY is not set',
      );
    });
  });

  // ─── afrus ────────────────────────────────────────────────────────────────

  describe('afrus getters', () => {
    it('getAfrusApiUrl returns env value', () => {
      makeService({ AFRUS_API_URL: 'https://custom.afrus.app' });
      expect(service.getAfrusApiUrl()).toBe('https://custom.afrus.app');
    });

    it('getAfrusApiUrl returns default', () => {
      makeService({});
      expect(service.getAfrusApiUrl()).toBe('https://backend.afrus.app');
    });

    it('getAfrusApiKey returns key from env', () => {
      makeService({ AFRUS_API_KEY: 'org-default-key' });
      expect(service.getAfrusApiKey()).toBe('org-default-key');
    });

    it('getAfrusApiKey returns null when not set', () => {
      makeService({});
      expect(service.getAfrusApiKey()).toBeNull();
    });
  });

  // ─── ALMA ─────────────────────────────────────────────────────────────────

  describe('ALMA getters', () => {
    it('getAlmaWebhookUrl returns env value', () => {
      makeService({
        ALMA_WEBHOOK_URL: 'https://custom.alma/webhook',
      });
      expect(service.getAlmaWebhookUrl()).toBe(
        'https://custom.alma/webhook',
      );
    });

    it('getAlmaWebhookUrl returns default', () => {
      makeService({});
      expect(service.getAlmaWebhookUrl()).toBe(
        'https://backend.afrus.app/api/v1/alma/webhook',
      );
    });

    it('getAlmaWebhookSecret returns null when not set', () => {
      makeService({});
      expect(service.getAlmaWebhookSecret()).toBeNull();
    });

    it('getAlmaWebhookSecret returns value when set', () => {
      makeService({ ALMA_WEBHOOK_SECRET: 'my-secret' });
      expect(service.getAlmaWebhookSecret()).toBe('my-secret');
    });
  });

  // ─── JWT ──────────────────────────────────────────────────────────────────

  describe('JWT getters', () => {
    it('getJwtSecret returns secret from env', () => {
      makeService({ JWT_SECRET: 'super-secret-at-least-20-chars-long' });
      expect(service.getJwtSecret()).toBe('super-secret-at-least-20-chars-long');
    });

    it('getJwtExpiresIn returns env value', () => {
      makeService({ JWT_EXPIRES_IN: '24h' });
      expect(service.getJwtExpiresIn()).toBe('24h');
    });

    it('getJwtExpiresIn defaults to 7d', () => {
      makeService({});
      expect(service.getJwtExpiresIn()).toBe('7d');
    });
  });

  // ─── Application ──────────────────────────────────────────────────────────

  describe('App getters', () => {
    it('getPort returns env value', () => {
      makeService({ PORT: '8080' });
      expect(service.getPort()).toBe(8080);
    });

    it('getPort defaults to 3000', () => {
      makeService({});
      expect(service.getPort()).toBe(3000);
    });

    it('getNodeEnv returns env value', () => {
      makeService({ NODE_ENV: 'production' });
      expect(service.getNodeEnv()).toBe('production');
    });

    it('getNodeEnv defaults to development', () => {
      makeService({});
      expect(service.getNodeEnv()).toBe('development');
    });

    it('isProduction returns true when NODE_ENV=production', () => {
      makeService({ NODE_ENV: 'production' });
      expect(service.isProduction()).toBe(true);
    });

    it('isProduction returns false when not production', () => {
      makeService({ NODE_ENV: 'development' });
      expect(service.isProduction()).toBe(false);
    });

    it('getLogLevel returns env value', () => {
      makeService({ LOG_LEVEL: 'debug' });
      expect(service.getLogLevel()).toBe('debug');
    });

    it('getLogLevel defaults to info', () => {
      makeService({});
      expect(service.getLogLevel()).toBe('info');
    });
  });
});
