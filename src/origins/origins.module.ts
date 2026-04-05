import { Module } from '@nestjs/common';
import { OriginsController } from './origins.controller.js';
import { OriginsService } from './origins.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [OriginsController],
  providers: [OriginsService],
  exports: [OriginsService],
})
export class OriginsModule {}
