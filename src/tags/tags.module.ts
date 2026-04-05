import { Module } from '@nestjs/common';
import { TagsController } from './tags.controller.js';
import { TagsService } from './tags.service.js';
import { AlmaModule } from '../alma/alma.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [AlmaModule, PrismaModule],
  controllers: [TagsController],
  providers: [TagsService],
  exports: [TagsService],
})
export class TagsModule {}
