import { Module } from '@nestjs/common';
import { LeadsCommand } from './commands/leads.command.js';
import { StageCommand } from './commands/stage.command.js';
import { TagsCommand } from './commands/tags.command.js';
import { SyncCommand } from './commands/sync.command.js';
import { RecommendCommand } from './commands/recommend.command.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { TagsModule } from '../tags/tags.module.js';
import { SyncTagsModule } from '../sync-tags/sync-tags.module.js';
import { ExtractionModule } from '../extraction/extraction.module.js';
import { SyncModule } from '../sync/sync.module.js';
import { AgentsModule } from '../agents/agents.module.js';

@Module({
  imports: [
    PrismaModule,
    PipelineModule,
    TagsModule,
    SyncTagsModule,
    ExtractionModule,
    SyncModule,
    AgentsModule,
  ],
  providers: [
    LeadsCommand,
    StageCommand,
    TagsCommand,
    SyncCommand,
    RecommendCommand,
  ],
})
export class CliModule {}
