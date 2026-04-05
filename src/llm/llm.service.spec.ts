import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { LlmService } from './llm.service.js';
import { AppConfigService } from '../config/config.service.js';
import { LlmProvider as ConfigLlmProvider } from '../config/config.service.js';
import type { LlmMessage } from './llm.interface.js';

describe('LlmService', () => {
  let llmRequestMock: jest.Mock;

  beforeEach(async () => {
    llmRequestMock = jest.fn();
  });

  const makeService = async (providerType: ConfigLlmProvider = ConfigLlmProvider.OPENROUTER, apiKey = 'test-key') => {
    const mockHttp = { request: llmRequestMock };

    const mockConfig = {
      getLlmProvider: jest.fn().mockReturnValue(providerType),
      getOpenRouterApiKey: jest.fn().mockReturnValue(providerType === ConfigLlmProvider.OPENROUTER ? apiKey : null),
      getDeepInfraApiKey: jest.fn().mockReturnValue(providerType === ConfigLlmProvider.DEEPINFRA ? apiKey : null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmService,
        { provide: HttpService, useFactory: () => mockHttp },
        { provide: AppConfigService, useValue: mockConfig },
      ],
    }).compile();

    return module.get<LlmService>(LlmService);
  };

  const mockOkResponse = (content: string) =>
    llmRequestMock.mockReturnValue(
      of({ data: { choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }, model: 'test-model' } }),
    );

  describe('complete (OpenRouter)', () => {
    it('sends messages to OpenRouter API', async () => {
      mockOkResponse('Hello, world!');
      const service = await makeService(ConfigLlmProvider.OPENROUTER);
      const messages: LlmMessage[] = [
        { role: 'user', content: 'Say hello' },
      ];
      const result = await service.complete(messages);
      expect(result.content).toBe('Hello, world!');
    });

    it('respects temperature option', async () => {
      mockOkResponse('test');
      const service = await makeService(ConfigLlmProvider.OPENROUTER);
      await service.complete([{ role: 'user', content: 'hi' }], { temperature: 0.9 });
      expect(llmRequestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ temperature: 0.9 }),
        }),
      );
    });

    it('respects maxTokens option', async () => {
      mockOkResponse('test');
      const service = await makeService(ConfigLlmProvider.OPENROUTER);
      await service.complete([{ role: 'user', content: 'hi' }], { maxTokens: 500 });
      expect(llmRequestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ max_tokens: 500 }),
        }),
      );
    });
  });

  describe('complete (DeepInfra)', () => {
    it('sends messages to DeepInfra API', async () => {
      mockOkResponse('DeepInfra response');
      const service = await makeService(ConfigLlmProvider.DEEPINFRA);
      const result = await service.complete([{ role: 'user', content: 'hi' }]);
      expect(result.content).toBe('DeepInfra response');
    });
  });

  describe('completeAsUser', () => {
    it('prepends system message if provided', async () => {
      mockOkResponse('done');
      const service = await makeService(ConfigLlmProvider.OPENROUTER);
      await service.completeAsUser('What is 2+2?', 'You are a math tutor.');
      expect(llmRequestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            messages: [
              { role: 'system', content: 'You are a math tutor.' },
              { role: 'user', content: 'What is 2+2?' },
            ],
          }),
        }),
      );
    });

    it('omits system message when null', async () => {
      mockOkResponse('done');
      const service = await makeService(ConfigLlmProvider.OPENROUTER);
      await service.completeAsUser('What is 2+2?', null);
      expect(llmRequestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            messages: [{ role: 'user', content: 'What is 2+2?' }],
          }),
        }),
      );
    });
  });

  describe('getProviderName / getDefaultModel', () => {
    it('returns openrouter for OpenRouter provider', async () => {
      mockOkResponse('x');
      const service = await makeService(ConfigLlmProvider.OPENROUTER);
      expect(service.getProviderName()).toBe('openrouter');
    });

    it('returns deepinfra for DeepInfra provider', async () => {
      mockOkResponse('x');
      const service = await makeService(ConfigLlmProvider.DEEPINFRA);
      expect(service.getProviderName()).toBe('deepinfra');
    });
  });

  describe('switchProvider', () => {
    it('can switch from OpenRouter to DeepInfra', async () => {
      mockOkResponse('switched');
      const service = await makeService(ConfigLlmProvider.OPENROUTER);
      service.switchProvider(ConfigLlmProvider.DEEPINFRA);
      expect(service.getProviderName()).toBe('deepinfra');
    });
  });
});
