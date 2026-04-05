import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller.js';
import { LeadsService } from './leads.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
