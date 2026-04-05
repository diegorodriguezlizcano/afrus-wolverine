/**
 * LLM Provider interface — implemented by OpenRouter, DeepInfra, and future providers.
 */
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  finishReason?: string;
}

export interface LlmProvider {
  readonly name: string;
  readonly defaultModel: string;

  /**
   * Sends a chat completion request to the provider.
   */
  complete(messages: LlmMessage[], options?: LlmOptions): Promise<LlmResponse>;

  /**
   * Returns true if the provider is reachable and authenticated.
   */
  healthCheck(): Promise<boolean>;
}

export interface LlmOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
}
