import { Module } from '@nestjs/common';
import { SlaMonitorService } from './sla-monitor.service.js';
import { FutureReactivatorService } from './future-reactivator.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  providers: [SlaMonitorService, FutureReactivatorService],
  exports: [SlaMonitorService, FutureReactivatorService],
})
export class SlaModule {}
