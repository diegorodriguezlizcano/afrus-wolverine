import { Module } from '@nestjs/common';
import { SyncOrchestratorService } from './sync-orchestrator.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ExtractionModule } from '../extraction/extraction.module.js';
import { WritebackModule } from '../writeback/writeback.module.js';

@Module({
  imports: [PrismaModule, ExtractionModule, WritebackModule],
  providers: [SyncOrchestratorService],
  exports: [SyncOrchestratorService],
})
export class SyncModule {}
