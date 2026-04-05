import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AppConfigService, LlmProvider as ConfigLlmProvider } from '../config/config.service.js';
import { OpenRouterProvider } from './providers/openrouter.provider.js';
import { DeepInfraProvider } from './providers/deepinfra.provider.js';
import type { LlmMessage, LlmOptions, LlmProvider, LlmResponse } from './llm.interface.js';

/**
 * LLM Service — factory that provides the active LLM provider.
 *
 * Provider is selected via LLM_PROVIDER env var:
 * - "openrouter" → OpenRouterProvider
 * - "deepinfra" → DeepInfraProvider
 *
 * On startup, all configured providers run health checks.
 */
@Injectable()
export class LlmService implements OnModuleInit {
  private readonly logger = new Logger(LlmService.name);
  private provider: LlmProvider;

  constructor(
    private readonly configService: AppConfigService,
    private readonly httpService: HttpService,
  ) {
    this.provider = this.createProvider(configService.getLlmProvider());
  }

  async onModuleInit() {
    await this.runHealthChecks();
  }

  /**
   * Selects and creates the appropriate provider instance.
   */
  private createProvider(providerType: ConfigLlmProvider): LlmProvider {
    switch (providerType) {
      case ConfigLlmProvider.OPENROUTER:
        return new OpenRouterProvider(
          this.configService.getOpenRouterApiKey() ?? '',
          this.httpService,
        );

      case ConfigLlmProvider.DEEPINFRA:
        return new DeepInfraProvider(
          this.configService.getDeepInfraApiKey() ?? '',
          this.httpService,
        );

      default:
        throw new Error(`Unknown LLM_PROVIDER: ${providerType}`);
    }
  }

  /**
   * Switches the active provider at runtime (for hot-reloading or testing).
   */
  switchProvider(providerType: ConfigLlmProvider) {
    this.provider = this.createProvider(providerType);
    this.logger.log(`Switched LLM provider to: ${providerType}`);
  }

  /**
   * Get the active provider instance.
   */
  getProvider(): LlmProvider {
    return this.provider;
  }

  /**
   * Get the name of the active provider.
   */
  getProviderName(): string {
    return this.provider.name;
  }

  /**
   * Get the default model of the active provider.
   */
  getDefaultModel(): string {
    return this.provider.defaultModel;
  }

  /**
   * Send a chat completion request to the active LLM provider.
   */
  async complete(
    messages: LlmMessage[],
    options?: LlmOptions,
  ): Promise<LlmResponse> {
    return this.provider.complete(messages, options);
  }

  /**
   * Convenience: complete with a single user message.
   */
  async completeAsUser(
    userMessage: string,
    systemPrompt: string | null = null,
    options?: LlmOptions,
  ): Promise<LlmResponse> {
    const messages: LlmMessage[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: userMessage });
    return this.complete(messages, options);
  }

  /**
   * Check health of the active provider.
   */
  async healthCheck(): Promise<boolean> {
    return this.provider.healthCheck();
  }

  /**
   * Run startup health checks on all configured providers.
   */
  private async runHealthChecks() {
    this.logger.log('Running LLM provider health checks...');

    const providers: Array<{ type: ConfigLlmProvider; key: string | null; name: string }> = [
      { type: ConfigLlmProvider.OPENROUTER, key: this.configService.getOpenRouterApiKey(), name: 'OpenRouter' },
      { type: ConfigLlmProvider.DEEPINFRA, key: this.configService.getDeepInfraApiKey(), name: 'DeepInfra' },
    ];

    for (const p of providers) {
      if (!p.key) {
        this.logger.debug(`${p.name}: not configured (no API key)`);
        continue;
      }
      try {
        if (p.type === this.configService.getLlmProvider()) {
          const ok = await this.provider.healthCheck();
          this.logger.log(`${p.name}: ${ok ? '✅ healthy' : '❌ unreachable'}`);
        }
      } catch (err) {
        this.logger.warn(`${p.name} health check error: ${err}`);
      }
    }
  }
}
