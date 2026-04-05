import { Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type { LlmMessage, LlmOptions, LlmProvider, LlmResponse } from '../llm.interface.js';

export class OpenRouterProvider implements LlmProvider {
  readonly name = 'openrouter';
  readonly defaultModel = 'anthropic/claude-3.5-haiku';

  private readonly baseUrl = 'https://openrouter.ai/api/v1';
  private readonly logger = new Logger(OpenRouterProvider.name);

  constructor(
    private readonly apiKey: string,
    private readonly httpService: HttpService,
  ) {}

  async complete(messages: LlmMessage[], options: LlmOptions = {}): Promise<LlmResponse> {
    const model = options.model ?? this.defaultModel;

    const response = await firstValueFrom(
      this.httpService.request<{
        choices: Array<{ message: { content: string; role: string }; finish_reason: string }>;
        usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
        model: string;
      }>({
        method: 'POST',
        url: `${this.baseUrl}/chat/completions`,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://wolverine.afrus.ai',
          'X-Title': 'Wolverine CRM',
        },
        data: {
          model,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 1024,
          top_p: options.topP,
          frequency_penalty: options.frequencyPenalty,
          presence_penalty: options.presencePenalty,
          stop: options.stop,
        },
        timeout: 60_000,
      }),
    );

    const choice = response.data.choices[0];
    return {
      content: choice.message.content,
      model: response.data.model,
      usage: {
        promptTokens: response.data.usage?.prompt_tokens,
        completionTokens: response.data.usage?.completion_tokens,
        totalTokens: response.data.usage?.total_tokens,
      },
      finishReason: choice.finish_reason,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      await firstValueFrom(
        this.httpService.request<{ data: unknown[] }>({
          method: 'GET',
          url: `${this.baseUrl}/models`,
          headers: { Authorization: `Bearer ${this.apiKey}` },
          timeout: 10_000,
        }),
      );
      return true;
    } catch (err) {
      this.logger.warn(`OpenRouter health check failed: ${err}`);
      return false;
    }
  }
}
