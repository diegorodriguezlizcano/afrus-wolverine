import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AfrusApiService } from './afrus-api.service.js';
import { AppConfigModule } from '../config/config.module.js';

@Module({
  imports: [
    AppConfigModule,
    HttpModule.register({ timeout: 15_000 }),
  ],
  providers: [AfrusApiService],
  exports: [AfrusApiService],
})
export class AfrusApiModule {}
