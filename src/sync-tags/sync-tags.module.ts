import { Module } from '@nestjs/common';
import { SyncTagsController } from './sync-tags.controller.js';
import { SyncTagsService } from './sync-tags.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [SyncTagsController],
  providers: [SyncTagsService],
  exports: [SyncTagsService],
})
export class SyncTagsModule {}
