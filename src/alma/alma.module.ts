import { Module } from '@nestjs/common';
import { AlmaWebhookClientService } from './alma-webhook-client.service.js';

@Module({
  providers: [AlmaWebhookClientService],
  exports: [AlmaWebhookClientService],
})
export class AlmaModule {}
