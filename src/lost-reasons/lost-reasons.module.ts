import { Module } from '@nestjs/common';
import { LostReasonsController } from './lost-reasons.controller.js';
import { LostReasonsService } from './lost-reasons.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [LostReasonsController],
  providers: [LostReasonsService],
  exports: [LostReasonsService],
})
export class LostReasonsModule {}
