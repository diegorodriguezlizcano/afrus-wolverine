import { Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type { LlmMessage, LlmOptions, LlmProvider, LlmResponse } from '../llm.interface.js';

export class DeepInfraProvider implements LlmProvider {
  readonly name = 'deepinfra';
  readonly defaultModel = 'meta-llama/Llama-3.3-70B-Instruct';

  private readonly baseUrl = 'https://api.deepinfra.com/v1/openai/chat';
  private readonly logger = new Logger(DeepInfraProvider.name);

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
        url: `${this.baseUrl}/completions`,
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
        this.httpService.request<{ models: unknown[] }>({
          method: 'GET',
          url: 'https://api.deepinfra.com/v1/models',
          headers: { Authorization: `Bearer ${this.apiKey}` },
          timeout: 10_000,
        }),
      );
      return true;
    } catch (err) {
      this.logger.warn(`DeepInfra health check failed: ${err}`);
      return false;
    }
  }
}
