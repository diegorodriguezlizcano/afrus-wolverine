import { Module } from '@nestjs/common';
import { NextActionAgent } from './next-action-agent.js';
import { LeadSummarizer } from './lead-summarizer.js';
import { ConversationDraftAgent } from './conversation-draft-agent.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { LlmModule } from '../llm/llm.module.js';

@Module({
  imports: [PrismaModule, LlmModule],
  providers: [NextActionAgent, LeadSummarizer, ConversationDraftAgent],
  exports: [NextActionAgent, LeadSummarizer, ConversationDraftAgent],
})
export class AgentsModule {}
