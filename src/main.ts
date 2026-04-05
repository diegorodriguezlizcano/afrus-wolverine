import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, Logger } from '@nestjs/common';
import { validateEnvironmentVariables } from './config/env.validation.js';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // ─── Fail fast on missing / invalid environment variables ───────────────
  const configErrors = validateEnvironmentVariables();
  if (configErrors.length > 0) {
    logger.error('❌ Config validation failed:');
    configErrors.forEach((e) => logger.error(`   - ${e}`));
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);

  await app.listen(port);
  logger.log(`Wolverine is running on port ${port}`);
}

bootstrap();
