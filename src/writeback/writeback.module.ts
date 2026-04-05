import { Module } from '@nestjs/common';
import { WritebackService } from './writeback.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AfrusApiModule } from '../afrus-api/afrus-api.module.js';

@Module({
  imports: [PrismaModule, AfrusApiModule],
  providers: [WritebackService],
  exports: [WritebackService],
})
export class WritebackModule {}
