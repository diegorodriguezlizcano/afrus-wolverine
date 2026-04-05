import { Module } from '@nestjs/common';
import { ExtractionController } from './extraction.controller.js';
import { ExtractionPipelineService } from './extraction-pipeline.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AfrusApiModule } from '../afrus-api/afrus-api.module.js';
import { SyncTagsModule } from '../sync-tags/sync-tags.module.js';

@Module({
  imports: [PrismaModule, AfrusApiModule, SyncTagsModule],
  controllers: [ExtractionController],
  providers: [ExtractionPipelineService],
  exports: [ExtractionPipelineService],
})
export class ExtractionModule {}
