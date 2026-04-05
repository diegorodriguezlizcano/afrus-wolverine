import { Module } from '@nestjs/common';
import { NextActionAgent } from './next-action-agent.js';
import { LeadSummarizer } from './lead-summarizer.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { LlmModule } from '../llm/llm.module.js';

@Module({
  imports: [PrismaModule, LlmModule],
  providers: [NextActionAgent, LeadSummarizer],
  exports: [NextActionAgent, LeadSummarizer],
})
export class AgentsModule {}
