import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AlmaWebhookClientService } from './alma-webhook-client.service.js';

@Module({
  imports: [HttpModule],
  providers: [AlmaWebhookClientService],
  exports: [AlmaWebhookClientService],
})
export class AlmaModule {}
