import { Module } from '@nestjs/common';
import { PipelineController } from './pipeline.controller.js';
import { PipelineService } from './pipeline.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { WritebackModule } from '../writeback/writeback.module.js';

@Module({
  imports: [PrismaModule, WritebackModule],
  controllers: [PipelineController],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class PipelineModule {}
