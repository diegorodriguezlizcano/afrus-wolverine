import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { AppConfigService } from './config.service.js';
import { validateEnvironmentVariables } from './env.validation.js';

/**
 * Global configuration module.
 *
 * Re-exports Nest's ConfigModule (already configured globally in AppModule)
 * and provides AppConfigService as a global injectable.
 *
 * All modules can inject AppConfigService without importing this module.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
      validationOptions: {
        allowUnknown: false,
        abortEarly: true,
      },
      validate: validateEnvironmentVariables,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService, NestConfigModule],
})
export class AppConfigModule {}
