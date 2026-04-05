import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { HealthController } from './health.controller.js';
import { AppConfigModule } from './config/config.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AlmaModule } from './alma/alma.module.js';
import { TagsModule } from './tags/tags.module.js';
import { LeadsModule } from './leads/leads.module.js';
import { SyncTagsModule } from './sync-tags/sync-tags.module.js';
import { OriginsModule } from './origins/origins.module.js';
import { LostReasonsModule } from './lost-reasons/lost-reasons.module.js';
import { PipelineModule } from './pipeline/pipeline.module.js';
import { RuleEngineModule } from './rule-engine/rule-engine.module.js';
import { SlaModule } from './sla/sla.module.js';
import { AfrusApiModule } from './afrus-api/afrus-api.module.js';
import { ExtractionModule } from './extraction/extraction.module.js';
import { WritebackModule } from './writeback/writeback.module.js';
import { SyncModule } from './sync/sync.module.js';
import { LlmModule } from './llm/llm.module.js';
import { AgentsModule } from './agents/agents.module.js';

@Module({
  imports: [
    AppConfigModule,
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'ui', 'public'),
      serveRoot: '/ui',
    }),
    PrismaModule,
    AlmaModule,
    TagsModule,
    LeadsModule,
    SyncTagsModule,
    OriginsModule,
    LostReasonsModule,
    PipelineModule,
    RuleEngineModule,
    SlaModule,
    AfrusApiModule,
    ExtractionModule,
    WritebackModule,
    SyncModule,
    LlmModule,
    AgentsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
