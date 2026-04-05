import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { LlmService } from './llm.service.js';
import { OpenRouterProvider } from './providers/openrouter.provider.js';
import { DeepInfraProvider } from './providers/deepinfra.provider.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    HttpModule.register({ timeout: 60_000 }),
  ],
  providers: [LlmService, OpenRouterProvider, DeepInfraProvider],
  exports: [LlmService],
})
export class LlmModule {}
