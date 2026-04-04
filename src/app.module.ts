import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
      validationOptions: {
        allowUnknown: false,
        abortEarly: true,
      },
    }),
    ScheduleModule.forRoot(),
  ],
})
export class AppModule {}
