import { Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type { LlmMessage, LlmOptions, LlmProvider, LlmResponse } from '../llm.interface.js';

export class MiniMaxProvider implements LlmProvider {
  readonly name = 'minimax';
  readonly defaultModel = 'MiniMax-Text-01';

  private readonly baseUrl = 'https://api.minimax.io/v1';
  private readonly logger = new Logger(MiniMaxProvider.name);

  constructor(
    private readonly apiKey: string,
    private readonly httpService: HttpService,
  ) {}

  async complete(messages: LlmMessage[], options: LlmOptions = {}): Promise<LlmResponse> {
    const model = options.model ?? this.defaultModel;

    const response = await firstValueFrom(
      this.httpService.request<{
        choices: Array<{ message: { content: string }; finish_reason: string }>;
        usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
        model: string;
      }>({
        method: 'POST',
        url: `${this.baseUrl}/chat/completions`,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        data: {
          model,
          messages,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 1024,
          top_p: options.topP,
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
        this.httpService.request<{ model: string }>({
          method: 'POST',
          url: `${this.baseUrl}/models`,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          data: { model: this.defaultModel },
          timeout: 10_000,
        }),
      );
      return true;
    } catch (err) {
      this.logger.warn(`MiniMax health check failed: ${(err as Error).message}`);
      return false;
    }
  }
}
