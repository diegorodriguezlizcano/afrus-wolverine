import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AlmaWebhookClientService } from './alma-webhook-client.service.js';
import { AlmaCallbackController } from './alma-callback.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [HttpModule, PrismaModule],
  controllers: [AlmaCallbackController],
  providers: [AlmaWebhookClientService],
  exports: [AlmaWebhookClientService],
})
export class AlmaModule {}
