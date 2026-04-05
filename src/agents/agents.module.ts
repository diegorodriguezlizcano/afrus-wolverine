import { Module } from '@nestjs/common';
import { NextActionAgent } from './next-action-agent.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { LlmModule } from '../llm/llm.module.js';

@Module({
  imports: [PrismaModule, LlmModule],
  providers: [NextActionAgent],
  exports: [NextActionAgent],
})
export class AgentsModule {}
