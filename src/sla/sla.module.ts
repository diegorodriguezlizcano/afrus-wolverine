import { Module } from '@nestjs/common';
import { SlaMonitorService } from './sla-monitor.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  providers: [SlaMonitorService],
  exports: [SlaMonitorService],
})
export class SlaModule {}
