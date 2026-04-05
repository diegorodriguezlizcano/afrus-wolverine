import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
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

@Module({
  imports: [
    AppConfigModule, // Global config with typed AppConfigService
    ScheduleModule.forRoot(),
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
  ],
  controllers: [HealthController],
})
export class AppModule {}
